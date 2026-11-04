import type { AgentUploadTarget, FilePart } from "@agent-native/agentkit";
import type { AgentKitUploadDriver } from "@agent-native/agentkit/client";
import { agentNativePath } from "@agent-native/core/client/api-path";

export function createAgentKitFileUploadSupport() {
  const uploadedFiles = new Map<string, FilePart>();

  const operations = {
    createUpload: async () =>
      ({
        uploadId: `agent-upload-${crypto.randomUUID()}`,
        method: "POST",
        url: agentNativePath("/_agent-native/file-upload"),
        fields: {},
      }) satisfies AgentUploadTarget,
    completeUpload: async ({ uploadId }: { uploadId: string }) => {
      const uploaded = uploadedFiles.get(uploadId);
      if (!uploaded) throw new Error(`Upload ${uploadId} did not complete.`);
      uploadedFiles.delete(uploadId);
      return uploaded;
    },
  };

  const upload: AgentKitUploadDriver = async (target, file, context) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(target.fields ?? {})) {
      form.set(key, value);
    }
    form.set("file", file.body, file.name);
    const response = await fetch(target.url, {
      method: target.method,
      ...(target.headers ? { headers: target.headers } : {}),
      body: form,
      ...(context?.signal ? { signal: context.signal } : {}),
    });
    if (!response.ok) throw new Error(`Upload failed (${response.status}).`);

    const result: unknown = await response.json();
    if (
      typeof result !== "object" ||
      result === null ||
      !("url" in result) ||
      typeof result.url !== "string" ||
      !result.url
    ) {
      throw new Error("Upload returned an invalid response.");
    }
    uploadedFiles.set(target.uploadId, {
      type: "file",
      name: file.name,
      mediaType: file.mediaType,
      url: result.url,
      ...("id" in result && typeof result.id === "string"
        ? { fileId: result.id }
        : {}),
    });
  };

  return { operations, upload };
}
