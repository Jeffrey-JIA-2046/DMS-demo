import Constants from 'expo-constants'
import { Platform } from 'react-native'

const extra = Constants.expoConfig?.extra ?? {}

export const DEFAULT_THEME = 'light'
export const AVAILABLE_THEMES = ['light', 'ocean', 'sunset']

const trimSlash = (value, fallback) => (value || fallback || '').replace(/\/$/, '')

const resolveHostForAndroidEmulator = (url) => {
	if (Platform.OS !== 'android' || !url) {
		return url
	}
	return url
		.replace('http://localhost', 'http://10.0.2.2')
		.replace('https://localhost', 'https://10.0.2.2')
		.replace('http://127.0.0.1', 'http://10.0.2.2')
		.replace('https://127.0.0.1', 'https://10.0.2.2')
}

export const appDefaultSettings = Object.freeze({
	apiBaseUrl: trimSlash(extra.apiBaseUrl, 'http://localhost:8080'),
	chatbotApiUrl: trimSlash(extra.chatbotApiUrl, trimSlash(extra.apiBaseUrl, 'http://localhost:8080')),
	embeddingApiUrl: trimSlash(extra.embeddingApiUrl, 'http://localhost:5101'),
	theme: DEFAULT_THEME,
})

let runtimeSettings = { ...appDefaultSettings }

const normalizeSettings = (settings = {}) => ({
	apiBaseUrl: trimSlash(settings.apiBaseUrl, appDefaultSettings.apiBaseUrl),
	chatbotApiUrl: trimSlash(settings.chatbotApiUrl, settings.apiBaseUrl || appDefaultSettings.chatbotApiUrl),
	embeddingApiUrl: trimSlash(settings.embeddingApiUrl, appDefaultSettings.embeddingApiUrl),
	theme: AVAILABLE_THEMES.includes(settings.theme) ? settings.theme : DEFAULT_THEME,
})

export const setRuntimeSettings = (settings = {}) => {
	runtimeSettings = normalizeSettings(settings)
}

export const getRuntimeSettings = () => normalizeSettings(runtimeSettings)

export const getApiBaseUrl = () => resolveHostForAndroidEmulator(getRuntimeSettings().apiBaseUrl)
export const getChatbotApiUrl = () => resolveHostForAndroidEmulator(getRuntimeSettings().chatbotApiUrl)
export const getEmbeddingApiUrl = () => resolveHostForAndroidEmulator(getRuntimeSettings().embeddingApiUrl)
