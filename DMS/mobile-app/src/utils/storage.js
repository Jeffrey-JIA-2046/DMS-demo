import AsyncStorage from '@react-native-async-storage/async-storage'

export const keys = {
  auth: 'dms_auth',
  role: 'dms_role',
  me: 'dms_me',
}

export const readJson = async (key, fallback = null) => {
  try {
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch (err) {
    return fallback
  }
}

export const writeJson = async (key, value) => {
  await AsyncStorage.setItem(key, JSON.stringify(value))
}

export const clearMany = async (items) => {
  await AsyncStorage.multiRemove(items)
}
