import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireUserId, UnauthorizedError } from "@/lib/auth";

// Client-upload token route: the browser uploads directly to Blob (bypassing the
// ~4.5 MB function body limit); this route mints a short-lived, gated token.
//
// AUTH + PER-USER NAMESPACING: the token is only issued to a signed-in user, and the
// requested pathname is forced into that user's namespace `user/<userId>/...`. This is
// what makes owner-verification in /api/chat sound — a user cannot mint a token for, or
// reference, another user's blob path.
export async function POST(request: Request): Promise<Response> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return new Response("Unauthorized", { status: 401 });
    throw e;
  }

  const body = (await request.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        const prefix = `user/${userId}/`;
        // The client requests `user/<userId>/<filename>`. Reject anything not namespaced
        // to THIS user — the server is the authority, not the client-supplied path.
        if (!pathname.startsWith(prefix)) {
          throw new Error("Invalid upload path");
        }
        return {
          addRandomSuffix: true, // unguessable URL + no collisions within the namespace
          allowedContentTypes: [
            "application/pdf",
            "image/png",
            "image/jpeg",
            "image/webp",
          ],
          maximumSizeInBytes: 10 * 1024 * 1024,
          // Carried to onUploadCompleted (U3 wires the documents row).
          tokenPayload: JSON.stringify({ userId }),
        };
      },
      // Fires from Vercel's servers (not the browser); no-op for now (U3 wires the row).
      onUploadCompleted: async () => {},
    });
    return Response.json(json);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
