import { supabase } from '../supabaseClient.js'

/** Uploads a file to the given bucket/path and returns its public URL. */
export async function uploadImage(bucket, path, file) {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw error

  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path)
  return publicUrl
}
