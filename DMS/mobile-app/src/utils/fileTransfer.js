import * as FileSystem from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { Linking } from 'react-native'
import { authHeaders, resolveApiUrl } from '../api/httpClient'

const safeName = (name) => (name || 'download.bin').replace(/[^a-z0-9._-]+/gi, '_')

export const downloadAndShare = async (path, suggestedName) => {
  const url = await resolveApiUrl(path)
  const headers = await authHeaders()
  const destination = `${FileSystem.cacheDirectory}${safeName(suggestedName)}`
  await FileSystem.downloadAsync(url, destination, { headers })
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(destination)
  }
  return destination
}

export const downloadAndPreview = async (path, suggestedName) => {
  const url = await resolveApiUrl(path)
  const headers = await authHeaders()
  const destination = `${FileSystem.cacheDirectory}${safeName(suggestedName)}`
  await FileSystem.downloadAsync(url, destination, { headers })

  try {
    await Linking.openURL(destination)
    return destination
  } catch {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(destination)
    }
    return destination
  }
}
