import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type express from "express";
import { NDX_AGENT_RESOURCE, createNDXAgentResourceResolver, type NDXAgentResourceResolver } from "ndx/common";
import { analyzeModelFolderPatch, applyModelFolderPatch, draftModelFolderPatch, getSettingsWebDocument, updateSettingsWebDocument } from "ndx/webclient/server";
import { NDX_AGENT_WEB_API, type NDXAgentModelFolderPatchDraftRequest, type NDXAgentModelFolderPatchRequest, type NDXAgentWebSettingsResponse, type NDXAgentWebUpdateSettingsRequest } from "ndx/webclient/common";
import type { NDXLogger } from "ndx/common";
import { NDX_CONTAINER_USER_HOME } from "ndx/common/server-path";

export function attachAgentWebSettingsRoutes(app: express.Express, logger?: NDXLogger, resource: NDXAgentResourceResolver = createNDXAgentResourceResolver()) {
  app.get(NDX_AGENT_WEB_API.webSettings, async (_request, response, next) => {
    try {
      logger?.debug("web.settings.get.start");
      const body: NDXAgentWebSettingsResponse = { settings: await getSettingsWebDocument(NDX_CONTAINER_USER_HOME) };
      response.json(body);
      logger?.debug("web.settings.get.complete", { keys: body.settings.topLevelKeys });
    } catch (error) {
      next(error);
    }
  });

  app.put(NDX_AGENT_WEB_API.webSettings, async (request, response, next) => {
    try {
      logger?.info("web.settings.update.start");
      const body = request.body as NDXAgentWebUpdateSettingsRequest;
      const settings = await updateSettingsWebDocument(NDX_CONTAINER_USER_HOME, body);
      response.json({ settings } satisfies NDXAgentWebSettingsResponse);
      logger?.info("web.settings.update.complete", { keys: settings.topLevelKeys });
    } catch (error) {
      next(error);
    }
  });

  app.post(NDX_AGENT_WEB_API.modelFolderPatchAnalyze, async (request, response, next) => {
    try {
      const body = request.body as Partial<NDXAgentModelFolderPatchRequest>;
      const folderPath = typeof body.folderPath === "string" ? body.folderPath : "";
      if (!folderPath.trim()) {
        response.status(400).json({ error: resource(NDX_AGENT_RESOURCE.WEB_PATH_REQUIRED_ERROR, { language: request.body?.language }) });
        return;
      }
      logger?.info("web.settings.model_patch.analyze.start", { folderPath });
      response.json(await analyzeModelFolderPatch(folderPath, { template: await loadModelTemplate() }));
      logger?.info("web.settings.model_patch.analyze.complete", { folderPath });
    } catch (error) {
      next(error);
    }
  });

  app.post(NDX_AGENT_WEB_API.modelFolderPatchApply, async (request, response, next) => {
    try {
      const body = request.body as Partial<NDXAgentModelFolderPatchRequest>;
      const folderPath = typeof body.folderPath === "string" ? body.folderPath : "";
      if (!folderPath.trim()) {
        response.status(400).json({ error: resource(NDX_AGENT_RESOURCE.WEB_PATH_REQUIRED_ERROR, { language: request.body?.language }) });
        return;
      }
      logger?.info("web.settings.model_patch.apply.start", { folderPath });
      response.json(await applyModelFolderPatch(folderPath, { template: await loadModelTemplate() }));
      logger?.info("web.settings.model_patch.apply.complete", { folderPath });
    } catch (error) {
      next(error);
    }
  });

  app.post(NDX_AGENT_WEB_API.modelFolderPatchDraft, async (request, response, next) => {
    try {
      const body = request.body as Partial<NDXAgentModelFolderPatchDraftRequest>;
      const folderName = typeof body.folderName === "string" ? body.folderName : "";
      if (!folderName.trim()) {
        response.status(400).json({ error: "모델 폴더 이름이 필요합니다." });
        return;
      }
      logger?.info("web.settings.model_patch.draft.start", { folderName });
      response.json(draftModelFolderPatch({
        folderName,
        publisher: typeof body.publisher === "string" ? body.publisher : undefined,
        baseModelKey: typeof body.baseModelKey === "string" ? body.baseModelKey : undefined,
        aliasModelKey: typeof body.aliasModelKey === "string" ? body.aliasModelKey : undefined,
        ggufFiles: Array.isArray(body.ggufFiles) ? body.ggufFiles.filter((value): value is string => typeof value === "string") : undefined,
        existingModelYaml: typeof body.existingModelYaml === "string" ? body.existingModelYaml : undefined,
        template: typeof body.template === "string" ? body.template : undefined
      }, { template: await loadModelTemplate() }));
      logger?.info("web.settings.model_patch.draft.complete", { folderName });
    } catch (error) {
      next(error);
    }
  });
}

async function loadModelTemplate(): Promise<string> {
  const currentFile = fileURLToPath(import.meta.url);
  const candidates = [
    path.resolve(process.cwd(), "dist/server/assets/system/modeltemplate/step-3.7-flash"),
    path.resolve(process.cwd(), "assets/system/modeltemplate/step-3.7-flash"),
    path.resolve(path.dirname(currentFile), "../../assets/system/modeltemplate/step-3.7-flash"),
    path.resolve(process.cwd(), "../../packages/ndx/src/agent/init/assets/system/modeltemplate/step-3.7-flash"),
    path.resolve(process.cwd(), "packages/ndx/src/agent/init/assets/system/modeltemplate/step-3.7-flash")
  ];
  for (const candidate of candidates) {
    const template = await fs.readFile(candidate, "utf8").catch(() => "");
    if (template.trim()) {
      return template;
    }
  }
  throw new Error("NDX model template asset was not found.");
}
