export const SYSTEM_DEFAULT_AUDIO_INPUT_ID = ''

export type AudioInputConstraints = {
  deviceId?: { exact: string }
}

export const resolveAudioInputSelection = (
  storedDeviceId: string,
  availableDeviceIds: readonly string[]
) =>
  storedDeviceId && availableDeviceIds.includes(storedDeviceId)
    ? storedDeviceId
    : SYSTEM_DEFAULT_AUDIO_INPUT_ID

export const buildAudioInputConstraints = (
  deviceId: string
): AudioInputConstraints =>
  deviceId ? { deviceId: { exact: deviceId } } : {}
