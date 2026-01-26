/*
 * ClipMaster - Virtual Keyboard
 * Based on gnome-shell-extension-clipboard-indicator
 * License: GPL-2.0-or-later
 */

import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class Keyboard {
    #device;
    #contentPurpose;
    #signalId;

    constructor() {
        const seat = Clutter.get_default_backend().get_default_seat();
        this.#device = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);

        // Track input context to detect terminal
        this.#signalId = Main.inputMethod.connect('notify::content-purpose', (method) => {
            this.#contentPurpose = method.content_purpose;
        });
    }

    destroy() {
        if (this.#signalId) {
            Main.inputMethod.disconnect(this.#signalId);
            this.#signalId = null;
        }
        if (this.#device) {
            this.#device.run_dispose();
            this.#device = null;
        }
    }

    #notify(key, state) {
        if (!this.#device) return;
        this.#device.notify_keyval(
            Clutter.get_current_event_time() * 1000,
            key,
            state
        );
    }

    get isTerminal() {
        return this.#contentPurpose === Clutter.InputContentPurpose.TERMINAL;
    }

    press(key) {
        this.#notify(key, Clutter.KeyState.PRESSED);
    }

    release(key) {
        this.#notify(key, Clutter.KeyState.RELEASED);
    }

    /**
     * Simulate paste keystroke (Shift+Insert or Ctrl+Shift+Insert for terminal)
     */
    paste() {
        if (this.isTerminal) {
            // Terminal: Ctrl+Shift+Insert
            this.press(Clutter.KEY_Control_L);
            this.press(Clutter.KEY_Shift_L);
            this.press(Clutter.KEY_Insert);
            this.release(Clutter.KEY_Insert);
            this.release(Clutter.KEY_Shift_L);
            this.release(Clutter.KEY_Control_L);
        } else {
            // Normal apps: Shift+Insert (universal paste)
            this.press(Clutter.KEY_Shift_L);
            this.press(Clutter.KEY_Insert);
            this.release(Clutter.KEY_Insert);
            this.release(Clutter.KEY_Shift_L);
        }
    }
}
