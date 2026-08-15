import * as state from './state.js';
import { showToast } from './ui.js';

export var MAIN_ROOM = 'efOiAhhNdL';

export function getSocket() {
  return state.getState().socket;
}

export function emit(event, payload) {
  var s = getSocket();
  if (s && s.connected) s.emit(event, payload || {});
  else showToast('الاتصال غير متاح، حاول مرة أخرى', 'error');
}

var ctx = {
  getSocket: getSocket,
  emit: emit,
  MAIN_ROOM: MAIN_ROOM
};

export function getCtx() {
  return ctx;
}

export function setCtx(partial) {
  if (partial) Object.assign(ctx, partial);
}

export default ctx;
