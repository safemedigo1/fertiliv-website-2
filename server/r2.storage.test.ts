import { describe, it, expect } from "vitest";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

describe("Cloudflare R2 Storage", () => {
  it("should connect to R2 and upload/delete a test file", async () => {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = process.env.R2_BUCKET_NAME;
    const publicUrl = process.env.R2_PUBLIC_URL;

    expect(accountId, "R2_ACCOUNT_ID must be set").toBeTruthy();
    expect(accessKeyId, "R2_ACCESS_KEY_ID must be set").toBeTruthy();
    expect(secretAccessKey, "R2_SECRET_ACCESS_KEY must be set").toBeTruthy();
    expect(bucketName, "R2_BUCKET_NAME must be set").toBeTruthy();
    expect(publicUrl, "R2_PUBLIC_URL must be set").toBeTruthy();

    const client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
    });

    const testKey = `test/vitest-r2-${Date.now()}.txt`;

    // Upload a test file
    const putResult = await client.send(
      new PutObjectCommand({
        Bucket: bucketName!,
        Key: testKey,
        Body: Buffer.from("Fertiliv R2 vitest connection check"),
        ContentType: "text/plain",
      }),
    );
    expect(putResult.$metadata.httpStatusCode).toBe(200);

    // Verify the public URL format
    const expectedUrl = `${publicUrl!.replace(/\/+$/, "")}/${testKey}`;
    expect(expectedUrl).toContain("r2.dev");

    // Cleanup
    const deleteResult = await client.send(
      new DeleteObjectCommand({ Bucket: bucketName!, Key: testKey }),
    );
    expect(deleteResult.$metadata.httpStatusCode).toBe(204);
  }, 15000);
});
