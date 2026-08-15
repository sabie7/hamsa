export const ui = {
  loginOverlay: document.getElementById('login-overlay'),
  chatShell: document.getElementById('chat-shell'),
  chatUI: document.getElementById('chat-ui'),
  messagesContainer: document.getElementById('messages-container'),
  sidebar: document.getElementById('right-sidebar'),
  sidebarTitle: document.getElementById('sidebar-title'),
  sidebarOverlay: document.getElementById('sidebar-overlay'),
  sidebarContent: document.getElementById('sidebar-content'),
  sidebarSearchContainer: document.getElementById('sidebar-search-container'),
  sidebarSearchInput: document.getElementById('sidebar-search-input'),
  closeSidebar: document.getElementById('close-sidebar'),
  
  // Sidebar Tab Containers
  sidebarUsersContainer: document.getElementById('sidebar-users-container'),
  sidebarRoomsContainer: document.getElementById('sidebar-rooms-container'),
  sidebarGamesContainer: document.getElementById('sidebar-games-container'),
  sidebarWallContainer: document.getElementById('sidebar-wall-container'),
  sidebarSettingsContainer: document.getElementById('sidebar-settings-container'),
  sidebarPrivateContainer: document.getElementById('sidebar-private-container'),
  
  emojiPicker: document.getElementById('emoji-picker'),
  emojiPickerContent: document.getElementById('emoji-picker-content'),
  closeEmojiPicker: document.getElementById('close-emoji-picker'),
  pickerTabs: document.querySelectorAll('.picker-tab'),
  
  chatForm: document.getElementById('chat-form'),
  chatInput: document.getElementById('chat-input'),
  fileInput: document.getElementById('file-input'),
  uploadBtn: document.getElementById('upload-btn'),
  settingsUploadBtn: document.getElementById('settings-upload-btn'),
  emojiBtn: document.getElementById('emoji-btn'),
  clearChatBtn: document.getElementById('clear-chat-btn'),
  leaveRoomBtn: document.getElementById('leave-room-btn'),
  botMsgBtn: document.getElementById('bot-msg-btn'),
  extraActionsToggle: document.getElementById('extra-actions-toggle'),
  extraActionsMenu: document.getElementById('extra-actions-menu'),
  botModeBar: document.getElementById('bot-mode-bar'),
  botModeSelection: document.getElementById('bot-mode-selection'),
  botModeSelect: document.getElementById('bot-mode-select'),
  exitBotModeBtn: document.getElementById('exit-bot-mode-btn'),
  botModeToggle: document.getElementById('bot-mode-toggle'),
  toggleSelf: document.getElementById('toggle-self'),
  labelToggleSelf: document.getElementById('label-toggle-self'),
  toggleBot: document.getElementById('toggle-bot'),
  labelToggleBot: document.getElementById('label-toggle-bot'),
  changeBotBtn: document.getElementById('change-bot-btn'),
  exitBotModeBtn2: document.getElementById('exit-bot-mode-btn-2'),
  toggleSoundBtn: document.getElementById('toggle-sound'),
  micButtons: [
    document.getElementById('mic-1'),
    document.getElementById('mic-2'),
    document.getElementById('mic-3'),
    document.getElementById('mic-4'),
    document.getElementById('mic-5'),
    document.getElementById('mic-6'),
    document.getElementById('mic-7')
  ],
  
  onlineCount: document.getElementById('online-count'),
  usersTabBtn: document.getElementById('users-tab-btn'),
  privateTabBtn: document.getElementById('private-tab-btn'),
  wallTabBtn: document.getElementById('wall-tab-btn'),
  roomsTabBtn: document.getElementById('rooms-tab-btn'),
  settingsBtn: document.getElementById('settings-btn'),
  
  replyPreview: document.getElementById('reply-preview'),
  replyToAvatar: document.getElementById('reply-to-avatar'),
  replyToUser: document.getElementById('reply-to-user'),
  replyToText: document.getElementById('reply-to-text'),
  replyToMedia: document.getElementById('reply-to-media'),
  cancelReply: document.getElementById('cancel-reply'),
  
  landingUsersList: document.getElementById('landing-users-list'),
  landingUsersCount: document.getElementById('landing-users-count'),
  memberForm: document.getElementById('member-login-form'),
  guestForm: document.getElementById('guest-login-form'),
  registerForm: document.getElementById('register-form'),
  showRegister: document.getElementById('show-register'),
  showMemberLogin: document.getElementById('show-member-login'),
  showGuestLogin: document.getElementById('show-guest-login'),
  
  userProfileModal: document.getElementById('userProfileModal'),
  profileHeaderTopic: document.getElementById('profile-header-topic'),
  profileHeaderBanner: document.getElementById('profile-header-banner'),
  profileAvatarHeader: document.getElementById('profile-avatar-header'),
  profileCover: document.getElementById('profile-cover'),
  profileAvatarModal: document.getElementById('profile-avatar-modal'),
  profileMainVerifiedBadge: document.getElementById('profile-main-verified-badge'),
  profileMsg: document.getElementById('profile-msg'),
  profileActionsGrid: document.getElementById('profile-actions-grid'),
  profileLikesCountBtn: document.getElementById('profile-likes-count-btn'),
  btnProfileLikes: document.getElementById('btn-profile-likes'),
  btnProfileAlert: document.getElementById('btn-profile-alert'),
  btnProfilePrivate: document.getElementById('btn-profile-private'),
  btnProfileDelPic: document.getElementById('btn-profile-del-pic'),
  btnProfileReveal: document.getElementById('btn-profile-reveal'),
  btnProfileGift: document.getElementById('btn-profile-gift'),
  btnProfileMuteRoom: document.getElementById('btn-profile-mute-room'),
  btnProfileMuteGlobal: document.getElementById('btn-profile-mute-global'),
  btnProfileBanner: document.getElementById('btn-profile-banner'),
  btnProfileDelFrame: document.getElementById('btn-profile-del-frame'),
  btnProfileDelBg: document.getElementById('btn-profile-del-bg'),
  btnProfileDelLink: document.getElementById('btn-profile-del-link'),
  btnProfileKickRoom: document.getElementById('btn-profile-kick-room'),
  btnProfileModRoom: document.getElementById('btn-profile-mod-room'),
  btnProfileKickGlobal: document.getElementById('btn-profile-kick-global'),
  btnProfileBan: document.getElementById('btn-profile-ban'),
  btnProfileReport: document.getElementById('btn-profile-report'),
  btnProfileIgnore: document.getElementById('btn-profile-ignore'),
  
  manageAddonsModal: document.getElementById('manageAddonsModal'),
  addonHeaderAvatar: document.getElementById('addon-header-avatar'),
  addonHeaderBanner: document.getElementById('addon-header-banner'),
  addonHeaderTopic: document.getElementById('addon-header-topic'),
  addonContent: document.getElementById('addon-content'),
  availableAddonsGrid: document.getElementById('available-addons-grid'),
  btnAddonsBack: document.getElementById('btn-addons-back'),
  btnRemoveAddon: document.getElementById('btn-remove-addon'),
  removeAddonText: document.getElementById('remove-addon-text'),
  
  createRoomModal: document.getElementById('createRoomModal'),
  createRoomForm: document.getElementById('create-room-form'),
  thumbnailInput: document.getElementById('thumbnail-input'),
  thumbnailPreview: document.getElementById('thumbnail-preview'),
  
  passwordModal: document.getElementById('passwordModal'),
  roomPasswordInput: document.getElementById('room-password-input'),
  submitPasswordBtn: document.getElementById('submit-password-btn'),
  
  lightbox: document.getElementById('lightbox'),
  lightboxImg: document.getElementById('lightbox-img'),
  lightboxClose: document.querySelector('.lightbox-close')
};

export function showToast(message, type = 'error') {
  const SwalObj = window.Swal;
  if (!SwalObj || !SwalObj.mixin) {
    // Fallback if Swal is not loaded
    alert(message);
    return;
  }
  
  const Toast = SwalObj.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    didOpen: (toast) => {
      toast.addEventListener('mouseenter', SwalObj.stopTimer)
      toast.addEventListener('mouseleave', SwalObj.resumeTimer)
    }
  });

  const fireMethod = window.originalSwalFire || Toast.fire;
  fireMethod.call(Toast, {
    toast: true,
    icon: type === 'success' ? 'success' : (type === 'info' ? 'info' : 'error'),
    title: message
  });
}

export function shakeElement(el) {
  if (!el) return;
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 500);
}
