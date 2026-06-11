import { z } from "zod";
import { ApiError, handler, ok } from "@/lib/api";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireTenantWrite } from "@/lib/tenant";
import { MAX_PHOTO_BYTES, photoExtension, uploadPhoto } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/students/[id]/photo — upload/replace a student photo (multipart "file"). */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { tenantId, session } = await requireTenantWrite();
  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) throw new ApiError("NOT_FOUND", "Student not found", 404);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File))
    throw new ApiError("NO_FILE", 'Multipart field "file" (image) is required', 400);

  const ext = photoExtension(file.type);
  if (!ext)
    throw new ApiError("INVALID_TYPE", "Only JPEG, PNG, or WebP images are allowed", 415);
  if (file.size > MAX_PHOTO_BYTES)
    throw new ApiError("FILE_TOO_LARGE", "Photo must be 2 MB or smaller", 413);

  const bytes = await file.arrayBuffer();

  const student = await withTenant(tenantId, async (tx) => {
    const existing = await tx.student.findFirst({
      where: { tenantId, publicId: id.data, deletedAt: null },
      select: { id: true, publicId: true, photoUrl: true },
    });
    if (!existing) throw new ApiError("NOT_FOUND", "Student not found", 404);

    const photoUrl = await uploadPhoto(
      `${session.tenantId}/students/${existing.publicId}.${ext}`,
      bytes,
      file.type,
    );

    const updated = await tx.student.update({
      where: { id: existing.id },
      data: { photoUrl },
      select: { publicId: true, photoUrl: true },
    });
    await audit(tx, {
      tenantId,
      action: "update",
      entity: "students",
      entityId: existing.publicId,
      before: { photoUrl: existing.photoUrl },
      after: { photoUrl },
    });
    return updated;
  });

  return ok(student);
});
