import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20'

export type R2Config = {
  accountId: string
  bucketName: string
  accessKeyId: string
  secretAccessKey: string
}

export function readR2Config(): R2Config | null {
  const accountId = (Deno.env.get('R2_ACCOUNT_ID') ?? '').trim()
  const bucketName = (Deno.env.get('R2_BUCKET_NAME') ?? '').trim()
  const accessKeyId = (Deno.env.get('R2_ACCESS_KEY_ID') ?? '').trim()
  const secretAccessKey = (Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '').trim()
  if (!accountId || !bucketName || !accessKeyId || !secretAccessKey) return null
  return { accountId, bucketName, accessKeyId, secretAccessKey }
}

export function isR2Configured(): boolean {
  return readR2Config() != null && (Deno.env.get('R2_STORAGE_ENABLED') ?? '1').trim() !== '0'
}

function endpointBase(cfg: R2Config): string {
  return `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucketName}`
}

function objectUrl(cfg: R2Config, objectKey: string): URL {
  const segments = objectKey.split('/').map((s) => encodeURIComponent(s))
  return new URL(`${endpointBase(cfg)}/${segments.join('/')}`)
}

function awsClient(cfg: R2Config): AwsClient {
  return new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: 's3',
    region: 'auto',
  })
}

export async function r2PresignGet(cfg: R2Config, objectKey: string, expiresSec: number): Promise<string> {
  const client = awsClient(cfg)
  const url = objectUrl(cfg, objectKey)
  const signed = await client.sign(url, {
    method: 'GET',
    aws: { signQuery: true, service: 's3', region: 'auto' },
    expiresIn: expiresSec,
  })
  return signed.url
}

export async function r2PresignPut(
  cfg: R2Config,
  objectKey: string,
  expiresSec: number,
  contentType: string,
): Promise<string> {
  const client = awsClient(cfg)
  const url = objectUrl(cfg, objectKey)
  const signed = await client.sign(url, {
    method: 'PUT',
    aws: { signQuery: true, service: 's3', region: 'auto' },
    expiresIn: expiresSec,
    headers: { 'Content-Type': contentType },
  })
  return signed.url
}

export async function r2HeadExists(cfg: R2Config, objectKey: string): Promise<boolean> {
  const client = awsClient(cfg)
  const url = objectUrl(cfg, objectKey)
  const signed = await client.sign(url, { method: 'HEAD', aws: { service: 's3', region: 'auto' } })
  const res = await fetch(signed)
  return res.status === 200
}

export async function r2DeleteObject(cfg: R2Config, objectKey: string): Promise<void> {
  const client = awsClient(cfg)
  const url = objectUrl(cfg, objectKey)
  const signed = await client.sign(url, { method: 'DELETE', aws: { service: 's3', region: 'auto' } })
  const res = await fetch(signed)
  if (!res.ok && res.status !== 404) {
    const t = await res.text().catch(() => '')
    throw new Error(`R2 delete ${res.status}: ${t.slice(0, 200)}`)
  }
}

export async function r2CopyObject(cfg: R2Config, fromKey: string, toKey: string): Promise<void> {
  const client = awsClient(cfg)
  const destUrl = objectUrl(cfg, toKey)
  const copySource = `/${cfg.bucketName}/${fromKey.split('/').map(encodeURIComponent).join('/')}`
  const signed = await client.sign(destUrl, {
    method: 'PUT',
    aws: { service: 's3', region: 'auto' },
    headers: { 'x-amz-copy-source': copySource },
  })
  const res = await fetch(signed)
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`R2 copy ${res.status}: ${t.slice(0, 200)}`)
  }
}

export async function r2MoveObject(cfg: R2Config, fromKey: string, toKey: string): Promise<void> {
  await r2CopyObject(cfg, fromKey, toKey)
  await r2DeleteObject(cfg, fromKey)
}
