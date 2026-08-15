export const voiceState = {
  audioElements: {},
  currentMicIndex: null,
  currentRoomId: null,
  currentVoiceSessionId: null,
  isIncomingMuted: false,
  isMuted: false,
  localMutedUsers: new Set(),
  localStream: null,
  localVolumes: {},
  masterIncomingVolume: 1,
  micsState: {},
  peerConnections: {}
};
