const {Gio, Shell, Meta, St, Clutter, Secret, GLib, Soup, GObject} = imports.gi;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Convenience = imports.misc.extensionUtils;
const Me = Convenience.getCurrentExtension();
// const Util = imports.misc.util;

const Lang = imports.lang;

// MainLoop for updating the time every X seconds.
const Mainloop = imports.mainloop;
const Utils = Me.imports.utils;

const HASS_TOGGLABLE_ENTITIES = 'hass-togglable-entities';
let hassExtension;

// Credits for organizing this class: https://github.com/vchlum/hue-lights/
var HassExtension = GObject.registerClass ({
    GTypeName: "HassMenu"
}, class HassMenu extends PanelMenu.Button {
    _init() {
        super._init(0, Me.metadata.name, false);
        this._settings = Convenience.getSettings('org.gnome.shell.extensions.hass-data');
        this._settings.connect("changed", Lang.bind(this, function() {
            if (this.needsRebuild()) {
                this.rebuildTray();
                this.buildTempSensorStats();
            }
        }));

        // Add tray icon
        let icon = new St.Icon({
            gicon : Gio.icon_new_for_string( Me.dir.get_path() + '/icons/hass-main.png' ),
            style_class : 'system-status-icon',
        });
        this.add_child(icon);

        this.needsRebuild();
        this.rebuildTray();

        // Build the temperature/humidity sensor statistics (if needed)
        this.buildTempSensorStats();
    }

    rebuildTray() {
        log("Rebuilding tray...");
        // Destroy the previous menu items
        let oldItems = this.menu._getMenuItems();
        for (let item in oldItems) {
            oldItems[item].destroy();
        }
        // I am using an array of objects because I want to get a full copy of the 
        // pmItem and the entityId. If I don't do that then the pmItem will be connected 
        // only to the laste entry of 'togglable_ent_ids' which means that whichever entry
        // of the menu you press, you will always toggle the same button
        var pmItems = [];
        // Get the togglable entities
        let togglables = this._getTogglableEntities();
        for (let entity of togglables) {
            if (entity.entity_id === "" || !entity.entity_id.includes("."))
                continue
            let pmItem = new PopupMenu.PopupMenuItem('Toggle:');
            pmItem.add_child(
                new St.Label({
                    text : entity.name
                })
            );
            this.menu.addMenuItem(pmItem);
            pmItems.push({item: pmItem, entity: entity.entity_id});
        }
        for (let item of pmItems) {
            item.item.connect('activate', () => {
                this._toggleEntity(item.entity)
            });
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Now build the submenu containing the HASS events
        let subItem = new PopupMenu.PopupSubMenuMenuItem('HASS Events');
        this.menu.addMenuItem(subItem);
        let start_hass_item = new PopupMenu.PopupMenuItem('Start Home Assistant');
        let stop_hass_item = new PopupMenu.PopupMenuItem('Stop Home Assistant');
        let close_hass_item = new PopupMenu.PopupMenuItem('Close Home Assistant');
        subItem.menu.addMenuItem(start_hass_item, 0);
        subItem.menu.addMenuItem(stop_hass_item, 1);
        subItem.menu.addMenuItem(close_hass_item, 2);
        start_hass_item.connect('activate', () => {
            this._triggerHassEvent('start');
        });
        stop_hass_item.connect('activate', () => {
            this._triggerHassEvent('stop');
        });
        close_hass_item.connect('activate', () => {
            this._triggerHassEvent('close');
        });

        // Settings button (Preferences)
        let popupImageMenuItem = new PopupMenu.PopupImageMenuItem(
            "Preferences",
            'security-high-symbolic',
        );
        popupImageMenuItem.connect('activate', () => {
            log("Opening Preferences...");
            Convenience.openPrefs();
        });
        this.menu.addMenuItem(popupImageMenuItem);
    }

    buildTempSensorStats() {
        if (this.showWeatherStats === true) {
            if (this.weatherStatsPanel === undefined) {
                // Add the temperature in the panel
                this.weatherStatsPanel = new St.Bin({
                    style_class : "panel-button",
                    reactive : true,
                    can_focus : true,
                    track_hover : true,
                    height : 30,
                });
                this.weatherStatsPanelText = new St.Label({
                    text : "-°C",
                    y_align: Clutter.ActorAlign.CENTER,
                });
                this.weatherStatsPanel.set_child(this.weatherStatsPanelText);
                this.weatherStatsPanel.connect("button-press-event", () => {
                    this._needsRebuildTempPanel();
                    this._refreshWeatherStats();
                });
            }

            this._refreshWeatherStats();

            if (this.doRefresh === true) {
                // Update weather stats every X seconds
                this.refreshTimeout = Mainloop.timeout_add_seconds(this.refreshSeconds,  () => {
                    this._needsRebuildTempPanel();
                    this._refreshWeatherStats();
                });
            }

            Main.panel._rightBox.insert_child_at_index(this.weatherStatsPanel, 1);
        } else {
            this._deleteTempStatsPanel();
        }
    }

    needsRebuild() {
        let trayNeedsRebuild = false;
        let tmp;

        // Check if the hass url changed.
        tmp = this.base_url;
        this.base_url = this._settings.get_string('hass-url');
        if (!this.base_url.endsWith("/")) {
            this.base_url += "/";  //  needs a trailing slash
        }
        if (tmp !== this.base_url) {
            trayNeedsRebuild = true;
        }

        // Check togglable ids
        tmp = this.togglable_ent_ids;
        this.togglable_ent_ids = this._settings.get_strv("hass-togglable-entities");
        if (tmp !== this.togglable_ent_ids) {
            trayNeedsRebuild = true;
        }

        // Do the same for all of the weather entities
        trayNeedsRebuild = this._needsRebuildTempPanel();
        
        return trayNeedsRebuild;
    }

    /**
     * 
     * @return {Array} An array of objects with keys: 'entity_id' and 'name' to be used when rebuilding the tray entries (the togglers).
     */
    _getTogglableEntities() {
        // Initialize the switched if this is the first time the function is being called
        if (this.allSwitches === undefined)
            this.allSwitches = Utils.discoverSwitches(this.base_url);
        if (this.togglable_ent_ids === undefined || this.togglable_ent_ids.length === 0) {
            // If the togglable entities provided by the user are empty then simply use all of the available entities
            // and also update the settings
            log("===========> _getTogglableEntities() first if")
            this._settings.set_strv(HASS_TOGGLABLE_ENTITIES, this.allSwitches.map(entry => entry.entity_id))
            return this.allSwitches
        } else {
            log("===========> _getTogglableEntities() second if")
            let output = [];
            // Only return the entities that appear in the user defined entities
            for (let togglable of this.allSwitches) {
                if (this.togglable_ent_ids.includes(togglable.entity_id)) {
                    output.push(togglable);
                }
            }
            return output
        }
    }

    _toggleEntity(entityId) {
        let data = `{"entity_id": "${entityId}"}`;
        let result = Utils.send_request(`${this.base_url}api/services/switch/toggle`, 'POST', data);
        if (!result) {
            return false;
        }
        return true;
    }

    _triggerHassEvent(event) {
        let result = Utils.send_request(`${this.base_url}api/events/homeassistant_${event}`, 'POST');
        if (!result) {
            return false;
        }
        return true;
    }

    _refreshWeatherStats() {
        try {
            let out = "";
            // if showWeatherStats is true then the temperature must be shown (the humidity can be turned off)
            out += this._getWeatherSensorData(this.tempEntityID);
            if (this.showHumidity === true) {
                out += ` | ${this._getWeatherSensorData(this.humidityEntityID)}`;
            }
            this.weatherStatsPanelText.text = out;
        } catch (error) {
            logError(error, "Could not refresh weather stats...");
            // will execute this function only once and abort. 
            // Remove in order to make the Main loop continue working.
            return false;
        }
        // By returning true, the function will continue refresing every X seconds
        return true; 
    }

    _getWeatherSensorData(entity_id) {
        let json_result = Utils.send_request(`${this.base_url}api/states/${entity_id}`);
        if (!json_result) {
            return false;
        }
        return `${json_result.state} ${json_result.attributes.unit_of_measurement}`;
    }

    _needsRebuildTempPanel() {
        let tmp;
        let tempPanelNeedsRebuild = false;

        // Check show weather stats
        tmp = this.showWeatherStats;
        this.showWeatherStats = this._settings.get_boolean('show-weather-stats');
        if (tmp !== this.showWeatherStats) {
            tempPanelNeedsRebuild = true;
        }

        // Check show humidity
        tmp = this.showHumidity;
        this.showHumidity = this._settings.get_boolean('show-humidity');
        if (tmp !== this.showHumidity) {
            tempPanelNeedsRebuild = true;
        }

        // Check temperature id change
        tmp = this.tempEntityID;
        this.tempEntityID = this._settings.get_string("temp-entity-id");
        if (tmp !== this.tempEntityID) {
            tempPanelNeedsRebuild = true;
        }

        // Check humidity id change
        tmp = this.humidityEntityID;
        this.humidityEntityID = this._settings.get_string("humidity-entity-id");
        if (tmp !== this.humidityEntityID) {
            tempPanelNeedsRebuild = true;
        }

        // Check refresh seconds changed
        tmp = this.refreshSeconds;
        this.refreshSeconds = Number(this._settings.get_string('weather-refresh-seconds'));
        if (tmp !== this.refreshSeconds) {
            tempPanelNeedsRebuild = true;
        }

        // Check doRefresh
        tmp = this.doRefresh;
        this.doRefresh = this._settings.get_boolean("refresh-weather");
        if (tmp !== this.doRefresh) {
            tempPanelNeedsRebuild = true;
        }
        return tempPanelNeedsRebuild;
    }

    _deleteTempStatsPanel() {

        if (this.weatherStatsPanel !== undefined) {
            Main.panel._rightBox.remove_child(this.weatherStatsPanel);
            if (this.doRefresh === true) {
                Mainloop.source_remove(this.refreshTimeout);
            }
        }
    }
})


function init() {

}


function enable() {
    hassExtension = new HassExtension();
    Main.panel.addToStatusArea('hass-extension', hassExtension, 1);
    // For the Shortcut
    // Shell.ActionMode.NORMAL
    // Shell.ActionMode.OVERVIEW
    // Shell.ActionMode.LOCK_SCREEN
    let mode = Shell.ActionMode.ALL;

    // Meta.KeyBindingFlags.PER_WINDOW
    // Meta.KeyBindingFlags.BUILTIN
    // Meta.KeyBindingFlags.IGNORE_AUTOREPEAT
    let flag = Meta.KeyBindingFlags.NONE;

    let shortcut_settings = Convenience.getSettings('org.gnome.shell.extensions.hass-shortcut');

    Main.wm.addKeybinding("hass-shortcut", shortcut_settings, flag, mode, () => {
        hassExtension.menu.toggle();
    });
}


function disable () {
    hassExtension._deleteTempStatsPanel();
    hassExtension.destroy();

    // Disable shortcut
    Main.wm.removeKeybinding("hass-shortcut");
}
