set -euo pipefail
. "$NDX_TOOL_DIRECTORY/../_lib/protocol.sh"
trap cancelled TERM INT

project_home="$(realpath -m "${NDX_PROJECT_HOME:-$PWD}")"
image_input="${1:-}"

if [ -z "${image_input// }" ]; then
  emit_error "path is required."
  exit 1
fi

emit_progress "resolving image path"
image_path="$(resolve_ndx_path "$image_input" "$project_home")"
require_ndx_path "$image_path" "$image_input"

if [ ! -f "$image_path" ]; then
  emit_error "image does not exist: $image_input"
  exit 1
fi

image_name="$(basename "$image_path")"
case "${image_name,,}" in
  *.png) mime_type="image/png" ;;
  *.jpg|*.jpeg) mime_type="image/jpeg" ;;
  *.webp) mime_type="image/webp" ;;
  *.gif) mime_type="image/gif" ;;
  *) emit_error "unsupported image extension: $image_name"; exit 1 ;;
esac

image_size="$(stat -c '%s' "$image_path")"

printf '{"type":"result","success":true,"output":'
printf 'Image loaded and queued as tool-generated user input: %s' "$image_name" | json_quote
printf ',"effects":[{"type":"append_user_message","text":'
printf 'Image loaded by getImage: %s' "$image_name" | json_quote
printf ',"attachments":[{"kind":"image","path":'
printf '%s' "$image_path" | json_quote
printf ',"name":'
printf '%s' "$image_name" | json_quote
printf ',"mimeType":'
printf '%s' "$mime_type" | json_quote
printf ',"size":%s}]},{"type":"inline_appended_user_message"}]}\n' "$image_size"
