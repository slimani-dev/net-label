/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const refreshInterval = 1;
const speedUnits = [
    "B/s", "K/s", "M/s", "G/s", "T/s", "P/s", "E/s", "Z/s", "Y/s"
];
let lastTotalDownBytes = 0;
let lastTotalUpBytes = 0;

const getCurrentNetSpeed = (refreshInterval) => {
    const ByteArray = new TextDecoder(('utf-8'));
    const speed = {"down": 0, "up": 0};

    try {
        const inputFile = Gio.File.new_for_path("/proc/net/dev");
        const [, content] = inputFile.load_contents(null);
        const lines = ByteArray.decode(content).split('\n');

        // Caculate the sum of all interfaces' traffic line by line.
        let totalDownBytes = 0;
        let totalUpBytes = 0;

        for (const element of lines) {
            const fields = element.trim().split(/\W+/);
            if (fields.length <= 2) {
                continue;
            }

            // Skip virtual interfaces.
            const interfaceName = fields[0];
            const currentInterfaceDownBytes = Number.parseInt(fields[1]);
            const currentInterfaceUpBytes = Number.parseInt(fields[9]);
            if (interfaceName === "lo" ||
                RegExp(/^ifb\d+/).exec(interfaceName) ||
                RegExp(/^lxdbr\d+/).exec(interfaceName) ||
                RegExp(/^virbr\d+/).exec(interfaceName) ||
                RegExp(/^br\d+/).exec(interfaceName) ||
                RegExp(/^vnet\d+/).exec(interfaceName) ||
                RegExp(/^tun\d+/).exec(interfaceName) ||
                RegExp(/^tap\d+/).exec(interfaceName) ||
                isNaN(currentInterfaceDownBytes) ||
                isNaN(currentInterfaceUpBytes)) {
                continue;
            }

            totalDownBytes += currentInterfaceDownBytes;
            totalUpBytes += currentInterfaceUpBytes;
        }

        if (lastTotalDownBytes === 0) {
            lastTotalDownBytes = totalDownBytes;
        }
        if (lastTotalUpBytes === 0) {
            lastTotalUpBytes = totalUpBytes;
        }

        speed["down"] = (totalDownBytes - lastTotalDownBytes) / refreshInterval;
        speed["up"] = (totalUpBytes - lastTotalUpBytes) / refreshInterval;

        lastTotalDownBytes = totalDownBytes;
        lastTotalUpBytes = totalUpBytes;
    } catch (e) {
        logError(e);
    }

    return speed;
};

const formatSpeedWithUnit = (amount) => {
    let unitIndex = 0;
    while (amount >= 1000 && unitIndex < speedUnits.length - 1) {
        amount /= 1000;
        ++unitIndex;
    }

    return `${amount.toFixed(2)} ${speedUnits[unitIndex]}`;
};

const toSpeedString = (speed) => {
    return `↓ ${formatSpeedWithUnit(speed["down"])} ↑ ${formatSpeedWithUnit(speed["up"])}`;
};

const NetLabel = GObject.registerClass(
class NetLabel extends PanelMenu.Button {
    _init() {
        super._init(0.0, _('netLabel',true));

        this._label = new St.Label({
            "y_align": Clutter.ActorAlign.CENTER,
            "text": "-"
        });

        this.add_child(this._label);
    }

    setLabelText(text) {
        return this._label.set_text(text);
    }
});



export default class NetLabelExtension extends Extension {
    enable() {
        lastTotalDownBytes = 0;
        lastTotalUpBytes = 0;

        this._indicator = new NetLabel();
        Main.panel.addToStatusArea(this.uuid, this._indicator, 1, 'left');

        this._timeout = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, refreshInterval, () => {
                const speed = getCurrentNetSpeed(refreshInterval);
                const text = toSpeedString(speed);
                log(text);
                this._indicator.setLabelText(text);

                return GLib.SOURCE_CONTINUE;
            }
        )
    }

    disable() {
        if (this._indicator != null) {
            this._indicator.destroy();
            this._indicator = null;
        }
        if (this._timeout != null) {
            GLib.source_remove(this._timeout);
            this._timeout = null;
        }
    }
}
