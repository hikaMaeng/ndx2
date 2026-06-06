import type express from "express";
import { NDX_AGENT_RESOURCE, createNDXAgentResourceResolver, type NDXAgentResourceResolver } from "ndx/common";
import {
  createSettingsWebModel,
  createSettingsWebProvider,
  deleteSettingsWebModel,
  deleteSettingsWebProvider,
  getSettingsWebProvider,
  listSettingsWebModel,
  listSettingsWebProvider,
  providerModelEndpointCandidates,
  syncSettingsWebProviderModels,
  updateSettingsWebModel,
  updateSettingsWebProvider
} from "ndx/webclient/server";
import type { NDXDatabase } from "ndx/agent";
import { NDX_CONTAINER_USER_HOME } from "ndx/common/server-path";
import {
  NDX_AGENT_WEB_API,
  type NDXAgentWebCreateModelRequest,
  type NDXAgentWebCreateProviderRequest,
  type NDXAgentWebModel,
  type NDXAgentWebModelsResponse,
  type NDXAgentWebProvider,
  type NDXAgentWebProvidersResponse,
  type NDXAgentWebUpdateModelRequest,
  type NDXAgentWebUpdateProviderRequest
} from "ndx/webclient/common";
import type { NDXLogger } from "ndx/common";

export function attachAgentWebModelRoutes(app: express.Express, database?: NDXDatabase, logger?: NDXLogger, resource: NDXAgentResourceResolver = createNDXAgentResourceResolver()) {
  app.get(NDX_AGENT_WEB_API.webProviders, async (request, response, next) => {
    try {
      logger?.debug("web.providers.list.start");
      const body: NDXAgentWebProvidersResponse = { providers: (await listSettingsWebProvider(NDX_CONTAINER_USER_HOME)).map((provider) => provider as NDXAgentWebProvider) };
      response.json(body);
      logger?.debug("web.providers.list.complete", { count: body.providers.length });
    } catch (error) {
      next(error);
    }
  });

  app.post(NDX_AGENT_WEB_API.webProviders, async (request, response, next) => {
    try {
      logger?.info("web.providers.create.start");
      const body = request.body as Partial<NDXAgentWebCreateProviderRequest>;
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const url = typeof body.url === "string" ? body.url.trim() : "";
      if (!title || !url) return response.status(400).json({ error: resource(NDX_AGENT_RESOURCE.WEB_PROVIDER_TITLE_URL_REQUIRED_ERROR, { language: request.body?.language }) });
      const provider = await createSettingsWebProvider(NDX_CONTAINER_USER_HOME, { title, type: "openai", url, token: typeof body.token === "string" ? body.token : "" });
      response.status(201).json(provider as NDXAgentWebProvider);
      logger?.info("web.providers.create.complete", { title: provider.title, url: provider.url });
      setImmediate(() => {
        void syncSettingsWebProviderModels(NDX_CONTAINER_USER_HOME, provider).catch((error) => logger?.warn("web.providers.background_sync.failed", { title: provider.title, error }));
      });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/agent/web-providers/:title", async (request, response, next) => {
    try {
      logger?.info("web.providers.update.start", { title: request.params.title });
      const body = request.body as Partial<NDXAgentWebUpdateProviderRequest>;
      const provider = await updateSettingsWebProvider(NDX_CONTAINER_USER_HOME, request.params.title, {
        type: body.type,
        url: body.url,
        token: body.token
      });
      response.json(provider);
      logger?.info("web.providers.update.complete", { title: provider.title });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/agent/web-providers/:title", async (request, response, next) => {
    try {
      logger?.info("web.providers.delete.start", { title: request.params.title });
      await deleteSettingsWebProvider(NDX_CONTAINER_USER_HOME, request.params.title);
      response.status(204).end();
      logger?.info("web.providers.delete.complete", { title: request.params.title });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/agent/web-providers/:title/models", async (request, response, next) => {
    try {
      logger?.debug("web.models.list.start", { title: request.params.title });
      const body: NDXAgentWebModelsResponse = { models: (await listSettingsWebModel(NDX_CONTAINER_USER_HOME, request.params.title)).map((model) => model as NDXAgentWebModel) };
      response.json(body);
      logger?.debug("web.models.list.complete", { title: request.params.title, count: body.models.length });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/agent/web-providers/:title/models/sync", async (request, response, next) => {
    try {
      logger?.info("web.models.sync.start", { title: request.params.title });
      const provider = await getSettingsWebProvider(NDX_CONTAINER_USER_HOME, request.params.title);
      if (!provider) return response.status(404).json({ error: resource(NDX_AGENT_RESOURCE.WEB_PROVIDER_NOT_FOUND_ERROR, { language: request.body?.language }) });
      const syncError = await syncSettingsWebProviderModels(NDX_CONTAINER_USER_HOME, provider).then(() => "").catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        return resource(NDX_AGENT_RESOURCE.WEB_MODEL_SYNC_FAILED_ERROR, {
          language: request.body?.language,
          values: { endpoints: providerModelEndpointCandidates(provider.url).join(", "), message }
        });
      });
      const body: NDXAgentWebModelsResponse = {
        models: (await listSettingsWebModel(NDX_CONTAINER_USER_HOME, request.params.title)).map((model) => model as NDXAgentWebModel),
        ...(syncError ? { syncError } : {})
      };
      response.json(body);
      logger?.info("web.models.sync.complete", { title: request.params.title, count: body.models.length, hasSyncError: Boolean(syncError) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/agent/web-providers/:title/models", async (request, response, next) => {
    try {
      logger?.info("web.models.create.start", { title: request.params.title });
      const body = request.body as Partial<NDXAgentWebCreateModelRequest>;
      const model = typeof body.model === "string" ? body.model.trim() : "";
      if (!model) return response.status(400).json({ error: resource(NDX_AGENT_RESOURCE.WEB_MODEL_REQUIRED_ERROR, { language: request.body?.language }) });
      const row = await createSettingsWebModel(NDX_CONTAINER_USER_HOME, {
        provider: request.params.title,
        model,
        contextsize: typeof body.contextsize === "number" ? body.contextsize : 100_000,
        modalities: normalizeModalities(body.modalities),
        ...(isReasoningEffort(body.reasoningEffort) ? { reasoningEffort: body.reasoningEffort } : {}),
        ...(typeof body.temperature === "number" ? { temperature: body.temperature } : {}),
        ...(typeof body.topP === "number" ? { topP: body.topP } : {}),
        ...(typeof body.topK === "number" ? { topK: body.topK } : {}),
        ...(typeof body.minP === "number" ? { minP: body.minP } : {})
      });
      response.status(201).json(row);
      logger?.info("web.models.create.complete", { title: row.provider, model: row.model });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/agent/web-providers/:title/models/:model", async (request, response, next) => {
    try {
      logger?.info("web.models.update.start", { title: request.params.title, model: request.params.model });
      const body = request.body as Partial<NDXAgentWebUpdateModelRequest>;
      const row = await updateSettingsWebModel(NDX_CONTAINER_USER_HOME, request.params.title, request.params.model, {
        contextsize: typeof body.contextsize === "number" ? body.contextsize : 100_000,
        modalities: body.modalities ? normalizeModalities(body.modalities) : undefined,
        reasoningEffort: isReasoningEffort(body.reasoningEffort) ? body.reasoningEffort : body.reasoningEffort === null ? null : undefined,
        temperature: typeof body.temperature === "number" ? body.temperature : body.temperature === null ? null : undefined,
        topP: typeof body.topP === "number" ? body.topP : body.topP === null ? null : undefined,
        topK: typeof body.topK === "number" ? body.topK : body.topK === null ? null : undefined,
        minP: typeof body.minP === "number" ? body.minP : body.minP === null ? null : undefined
      });
      response.json(row);
      logger?.info("web.models.update.complete", { title: row.provider, model: row.model });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/agent/web-providers/:title/models/:model", async (request, response, next) => {
    try {
      logger?.info("web.models.delete.start", { title: request.params.title, model: request.params.model });
      await deleteSettingsWebModel(NDX_CONTAINER_USER_HOME, request.params.title, request.params.model);
      response.status(204).end();
      logger?.info("web.models.delete.complete", { title: request.params.title, model: request.params.model });
    } catch (error) {
      next(error);
    }
  });
}

function normalizeModalities(value: unknown): Array<"text" | "image" | "file"> {
  if (!Array.isArray(value)) {
    return ["text"];
  }
  const allowed = new Set(["text", "image", "file"]);
  return [...new Set([...value.filter((item) => allowed.has(item)), "text"])] as Array<"text" | "image" | "file">;
}

function isReasoningEffort(value: unknown): value is "low" | "medium" | "high" {
  return value === "low" || value === "medium" || value === "high";
}
