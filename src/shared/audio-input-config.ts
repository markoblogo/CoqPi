export const SYSTEM_DEFAULT_AUDIO_INPUT_ID = ''

export type AudioInputConstraints = {
  deviceId?: { exact: string }
  echoCancellation?: boolean
  noiseSuppression?: boolean
  autoGainControl?: boolean
}

export const resolveAudioInputSelection = (
  storedDeviceId: string,
  availableDeviceIds: readonly string[]
) =>
  storedDeviceId && availableDeviceIds.includes(storedDeviceId)
    ? storedDeviceId
    : SYSTEM_DEFAULT_AUDIO_INPUT_ID

export const buildAudioInputConstraints = (
  deviceId: string,
  source: 'microphone' | 'system' = 'microphone'
): AudioInputConstraints => ({
  ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  // A loopback is already mixed call audio, not acoustic microphone input.
  ...(source === 'system' ? {echoCancellation:false, noiseSuppression:false, autoGainControl:false} : {})
})
