import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { uuidv7 } from 'uuidv7';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly bucketName: string;
  private readonly publicUrl: string;

  constructor() {
    const endpoint = process.env.STORAGE_ENDPOINT || 'http://localhost:9000';
    const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID || 'dev';
    const secretAccessKey =
      process.env.STORAGE_SECRET_ACCESS_KEY || 'devdevdev';
    this.bucketName = process.env.STORAGE_BUCKET_NAME || 'media';
    this.publicUrl =
      process.env.STORAGE_PUBLIC_URL ||
      `${endpoint.replace(/\/$/, '')}/${this.bucketName}`;

    if (process.env.NODE_ENV === 'production') {
      if (
        !process.env.STORAGE_ACCESS_KEY_ID ||
        !process.env.STORAGE_SECRET_ACCESS_KEY
      ) {
        throw new Error('Production storage credentials must be provided.');
      }
    }

    this.s3 = new S3Client({
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      region: process.env.STORAGE_REGION || 'us-east-1',
      forcePathStyle: true,
    });
  }

  async generatePresignedPost(
    filename: string,
    contentType: string,
  ): Promise<{ url: string; fields: Record<string, string>; key: string }> {
    const extension = filename.split('.').pop() || '';
    const key = `raw/${uuidv7()}${extension ? '.' + extension : ''}`;

    const post = await createPresignedPost(this.s3, {
      Bucket: this.bucketName,
      Key: key,
      Conditions: [
        ['content-length-range', 1, 5 * 1024 * 1024], // 5MB max
        ['eq', '$Content-Type', contentType],
      ],
      Fields: {
        'Content-Type': contentType,
      },
      Expires: 900, // 15 minutes TTL
    });

    return {
      url: post.url,
      fields: post.fields,
      key,
    };
  }

  async checkObjectExists(key: string): Promise<boolean> {
    try {
      await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async getObjectRange(
    key: string,
    start: number,
    end: number,
  ): Promise<Buffer> {
    const response = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Range: `bytes=${start}-${end}`,
      }),
    );

    if (!response.Body) {
      throw new Error('Empty object body received.');
    }

    const chunks: Buffer[] = [];
    const stream = response.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async getFullObject(key: string): Promise<Buffer> {
    const response = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );

    if (!response.Body) {
      throw new Error('Empty object body received.');
    }

    const chunks: Buffer[] = [];
    const stream = response.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async uploadProcessed(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<string> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return `${this.publicUrl}/${key}`;
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
    } catch (err) {
      this.logger.error(`Failed to delete storage key: ${key}`, err);
    }
  }
}
