export let currentUser = null;
export let currentRoomId = 0;
export let isRoomFrozen = false;
export let shortcuts = [];
export let smileys = [];
export let activeSidebarTab = null;
export let currentUsers = [];
export let rooms = [];
export let replyingTo = null;
export let ignoredUsers = new Set();
export let isSettingsUpload = false;
export let loginBehavior = { behavior: 'default_room', openUsersTabOnLogin: false };
export let settings = {};
export let limits = { public: 300, private: 500 };
export let previousUserSignatures = {};

export function setCurrentUser(user) {
  if (user) {
    if (user.group && user.group.roleRank !== undefined && (user.roleRank === undefined || user.roleRank === null)) {
      user.roleRank = user.group.roleRank;
    }
    if (user.muteNotificationSounds !== undefined) {
      try {
        localStorage.setItem('muteNotificationSounds', user.muteNotificationSounds ? 'true' : 'false');
      } catch (e) {}
    } else {
      user.muteNotificationSounds = localStorage.getItem('muteNotificationSounds') === 'true';
    }
  }
  currentUser = user;
}
export function setIsSettingsUpload(val) { isSettingsUpload = val; }
export function setSettings(val) { settings = val; }
export function setLimits(val) { limits = val; }
export function setLoginBehavior(val) { loginBehavior = val; }
export let isInWaitingRoom = false;
export let waitingRoomId = null;
export function setWaitingRoomId(id) { waitingRoomId = id; }
export let GENERAL_ROOM_ID = 1;
export function setGeneralRoomId(id) { GENERAL_ROOM_ID = id; }

export function setCurrentRoomId(roomId) { 
  currentRoomId = roomId; 
  const numericRoomId = Number(roomId);
  // Prioritize numeric check using the authoritative ID from server
  if (waitingRoomId && (roomId === waitingRoomId || numericRoomId === waitingRoomId)) {
    isInWaitingRoom = true;
  } else {
    // Keep string check only as a legacy fallback
    isInWaitingRoom = (roomId === 'waiting-room');
  }
}
export function setIsRoomFrozen(frozen) { isRoomFrozen = frozen; }
export function setShortcuts(s) { shortcuts = s; }
export function setSmileys(s) { smileys = s; }

export function hasPermission(user, permission) {
  if (!user) return false;
  if (user.group && user.group[permission] === true) return true;
  if (user[permission] === true) return true;
  return false;
}



export function setActiveSidebarTab(tab) { activeSidebarTab = tab; }
export function setCurrentUsers(users) { currentUsers = users; }
export function setRooms(r) { rooms = r; }
export function setReplyingTo(reply) { replyingTo = reply; }
export function setIgnoredUsers(users) { ignoredUsers = users; }

export function loadIgnoredUsers() {
  try {
    const saved = sessionStorage.getItem('ignoredUsers');
    if (saved) {
      try {
        ignoredUsers = new Set(JSON.parse(saved));
      } catch (e) {
        ignoredUsers = new Set();
      }
    }
  } catch (e) {
    console.warn('Could not load ignored users from sessionStorage:', e);
    ignoredUsers = new Set();
  }
}
