import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

// Client-upload token route: the browser uploads directly to Blob (bypassing the
// ~4.5 MB function body limit); this route mints a short-lived, gated token.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async () => ({
        addRandomSuffix: true, // unguessable public URL
        allowedContentTypes: [
          "application/pdf",
          "image/png",
          "image/jpeg",
          "image/webp",
        ],
        maximumSizeInBytes: 10 * 1024 * 1024,
      }),
      // Fires from Vercel's servers (not the browser); no-op in dev.
      onUploadCompleted: async () => {},
    });
    return Response.json(json);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
