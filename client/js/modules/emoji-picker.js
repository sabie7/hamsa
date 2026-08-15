/* ══════════════════════════════════════════════════════════════
   EMOJI PICKER
   Populates the existing #emoji-picker container (smiley + sticker
   tabs) and inserts the chosen emoji into #chat-input at the cursor.
   Fixes the "frozen Emojis button" gap (issue #6).
   ══════════════════════════════════════════════════════════════ */

var SMILEYS = [
  '😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊', '😋', '😎',
  '😍', '🥰', '😘', '😗', '😙', '😚', '🙂', '🤗', '🤩', '🤔', '🤨', '😐',
  '😑', '😶', '🙄', '😏', '😣', '😥', '😮', '🤐', '😯', '😪', '😫', '🥱',
  '😴', '😌', '😛', '😜', '😝', '🤤', '😒', '😓', '😔', '😕', '🙃', '🤑',
  '😲', '☹️', '🙁', '😖', '😞', '😟', '😤', '😢', '😭', '😦', '😧', '😨',
  '😩', '🤯', '😬', '😰', '😱', '🥵', '🥶', '😳', '🤪', '😵', '😡', '😠',
  '🤬', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '😇', '🥳', '🥺', '🤠', '🤡',
  '🤥', '🤫', '🤭', '🧐', '🤓', '😈', '👿', '👻', '💀', '☠️', '👽', '🤖'
];

var STICKERS = [
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕',
  '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️', '💌', '💋', '👋', '🤚',
  '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈',
  '👉', '👆', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌',
  '👐', '🤲', '🤝', '🙏', '💪', '🔥', '✨', '⭐', '🌟', '💫', '⚡', '☄️',
  '🌈', '☀️', '🌙', '🌚', '🌝', '🌞', '🦋', '🌸', '🌹', '🌺', '💐', '🎉',
  '🎊', '🎁', '🥂', '🍀', '🏆', '🥇', '👑', '💎', '🚀', '⚽', '🎮', '🎵'
];

var activeTab = 'smiley';

function chatInput() {
  return document.getElementById('chat-input');
}

function insertEmoji(emoji) {
  var input = chatInput();
  if (!input) return;
  var start = input.selectionStart || input.value.length;
  var end = input.selectionEnd || input.value.length;
  input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
  var pos = start + emoji.length;
  input.focus();
  input.setSelectionRange(pos, pos);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function renderTab(tab) {
  var content = document.getElementById('emoji-picker-content');
  if (!content) return;
  var list = tab === 'sticker' ? STICKERS : SMILEYS;
  content.innerHTML = '';
  list.forEach(function (emoji) {
    var item = document.createElement('span');
    item.className = 'picker-item ' + tab;
    item.textContent = emoji;
    item.addEventListener('click', function () {
      insertEmoji(emoji);
    });
    content.appendChild(item);
  });
  activeTab = tab;
}

export function initEmojiPicker() {
  var picker = document.getElementById('emoji-picker');
  if (!picker) return;
  renderTab('smiley');

  document.addEventListener('click', function (e) {
    var tabBtn = e.target.closest('.picker-tab[data-tab]');
    if (!tabBtn) return;
    renderTab(tabBtn.getAttribute('data-tab'));
  });
}
