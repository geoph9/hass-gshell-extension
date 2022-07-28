const {Gio, Shell, Meta, St, Clutter, Secret, GLib, Soup, GObject} = imports.gi;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Convenience = imports.misc.extensionUtils;
const Me = Convenience.getCurrentExtension();
// const Util = imports.misc.util;
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

const Lang = imports.lang;

// MainLoop for updating the time every X seconds.
const Mainloop = imports.mainloop;
const Utils = Me.imports.utils;

const HASS_TOGGLABLE_ENTITIES = 'hass-togglable-entities';
const HASS_ENABLED_ENTITIES = 'hass-enabled-entities';
const HASS_PANEL_SENSOR_IDS = 'hass-panel-sensor-ids';
const HASS_ENABLED_SENSOR_IDS = 'hass-enabled-sensor-ids';
const HASS_SETTINGS = 'org.gnome.shell.extensions.hass-data';
let hassExtension;

// Credits for organizing this class: https://github.com/vchlum/hue-lights/
var HassExtension = GObject.registerClass ({
    GTypeName: "HassMenu"
}, class HassMenu extends PanelMenu.Button {
    _init() {
        super._init(0, Me.metadata.name, false);
        this._settings = Convenience.getSettings(HASS_SETTINGS);
        this._settings.connect("changed", Lang.bind(this, function() {
            if (this.needsRebuild()) {
                this.rebuildTray();
                this.buildTempSensorStats();
                this.buildPanelSensorEntities();
            }
        }));

        // Add tray icon
        let icon_path = this._settings.get_string('default-panel-icon');
        // Make sure the path is valid
        icon_path = icon_path.startsWith("/") ? icon_path : "/" + icon_path;
        let icon = new St.Icon({
            gicon : Gio.icon_new_for_string( Me.dir.get_path() + icon_path),
            style_class : 'system-status-icon',
        });
        this.add_child(icon);

        this.needsRebuild();
        this.rebuildTray();

        // Build the temperature/humidity sensor statistics (if needed)
        this.buildTempSensorStats();
        // Build panel entries for other sensors;
        this.buildPanelSensorEntities();
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
            let pmItem = new PopupMenu.PopupMenuItem(_('Toggle:'));
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
        let subItem = new PopupMenu.PopupSubMenuMenuItem(_('HASS Events'));
        this.menu.addMenuItem(subItem);
        let start_hass_item = new PopupMenu.PopupMenuItem(_('Start Home Assistant'));
        let stop_hass_item = new PopupMenu.PopupMenuItem(_('Stop Home Assistant'));
        let close_hass_item = new PopupMenu.PopupMenuItem(_('Close Home Assistant'));
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
            _("Preferences"),
            'security-high-symbolic',
        );
        popupImageMenuItem.connect('activate', () => {
            log("Opening Preferences...");
            Convenience.openPrefs();
        });
        this.menu.addMenuItem(popupImageMenuItem);
    }

    buildPanelSensorEntities() {
        let panelSensors = this._getSensorEntities();
        if (panelSensors.length === 0) {
            this._deleteSensorsPanel();
            return
        }
        if (this.sensorsPanel === undefined) {
            // Add the temperature in the panel
            this.sensorsPanel = new St.Bin({
                style_class : "panel-button",
                reactive : true,
                can_focus : true,
                track_hover : true,
                height : 30,
            });
            this.sensorsPanelText = new St.Label({
                text : "",
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.sensorsPanel.set_child(this.sensorsPanelText);
            this.sensorsPanel.connect("button-press-event", () => {
                this._needsRebuildSensorPanel(false);
                this._refreshPanelSensors();
            });
        }

        this._refreshPanelSensors();

        Main.panel._rightBox.insert_child_at_index(this.sensorsPanel, 1);
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
                    this._needsRebuildTempPanel(false);
                    this._refreshWeatherStats();
                });
            }

            this._refreshWeatherStats();

            if (this.doRefresh === true) {
                // Update weather stats every X seconds
                this.refreshTimeout = Mainloop.timeout_add_seconds(this.refreshSeconds,  () => {
                    this._needsRebuildTempPanel(false);
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
        if (!this.base_url.startsWith("http")){
            // use http:// by default
            this.base_url = "http://" + this.base_url;
        }
        if (tmp !== this.base_url) {
            trayNeedsRebuild = true;
        }

        // Check togglable ids
        tmp = this.togglable_ent_ids;
        this.togglable_ent_ids = this._settings.get_strv(HASS_ENABLED_ENTITIES);
        if (!Utils.arraysEqual(tmp, this.togglable_ent_ids)) {
            trayNeedsRebuild = true;
        }

        // Do the same for all of the weather entities
        trayNeedsRebuild = this._needsRebuildTempPanel(trayNeedsRebuild);
        // Do the same for all extra sensor entities
        trayNeedsRebuild = this._needsRebuildSensorPanel(trayNeedsRebuild);
        
        return trayNeedsRebuild;
    }

    /**
     * 
     * @return {Array} An array of objects with keys: 'entity_id' and 'name' to be used when rebuilding the tray entries (the togglers).
     */
    _getTogglableEntities() {
        // Initialize the switched if this is the first time the function is being called
        if (this.allSwitches === undefined) {
            this.allSwitches = Utils.discoverSwitches(this.base_url);
            this._settings.set_strv(HASS_TOGGLABLE_ENTITIES, this.allSwitches.map(entry => entry.entity_id))
        }
        if (this.togglable_ent_ids === undefined) {  // || this.togglable_ent_ids.length === 0) {
            // If the togglable entities provided by the user are empty then simply use all of the available entities
            // and also update the settings
            this._settings.set_strv(HASS_ENABLED_ENTITIES, this.allSwitches.map(entry => entry.entity_id))
            return this.allSwitches
        } else {
            let output = [];
            // Only return the entities that appear in the user defined entities
            for (let togglable of this.allSwitches) {
                if (this.togglable_ent_ids.includes(togglable.entity_id)) {
                    output.push(togglable);
                }
            }
            this._settings.set_strv(HASS_ENABLED_ENTITIES, output.map(entry => entry.entity_id));
            return output
        }
    }

    /**
     * 
     * @return {Array} An array of objects with keys: 'entity_id' and 'name' to be used when rebuilding the panel entries (the sensors).
     */
    _getSensorEntities() {
        // Initialize the switched if this is the first time the function is being called
        if (this.allSensors === undefined) {
            this.allSensors = Utils.discoverSensors(this.base_url);
            this._settings.set_strv(HASS_PANEL_SENSOR_IDS, this.allSensors.map(entry => entry.entity_id))
        }
        if (!this.panelSensorIds || this.panelSensorIds.length === 0) {
            // If the sensor entities provided by the user are empty then use nothing
            this._settings.set_strv(HASS_ENABLED_SENSOR_IDS, [])
            return []
        } else {
            if (this.allSensors.length === 0) return []
            let output = [];
            // Only return the entities that appear in the user defined entities
            for (let sensor of this.allSensors) {
                if (this.panelSensorIds.includes(sensor.entity_id)) {
                    output.push(sensor);
                }
            }
            this._settings.set_strv(HASS_ENABLED_SENSOR_IDS, output.map(entry => entry.entity_id));
            return output
        }
    }

    _toggleEntity(entityId) {
        let data = `{"entity_id": "${entityId}"}`;
        let domain = entityId.split(".")[0];  // e.g. light.mylight => light
        let result = Utils.send_request(`${this.base_url}api/services/${domain}/toggle`, 'POST', data);
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
            out += this._getPanelSensorData(this.tempEntityID);
            if (this.showHumidity === true) {
                out += ` | ${this._getPanelSensorData(this.humidityEntityID)}`;
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

    _refreshPanelSensors() {
        try {
            let sensorEntities = this._getSensorEntities();
            let outText = "";
            let tmp;
            for (let sensor of sensorEntities) {
                tmp = this._getPanelSensorData(sensor.entity_id)
                if (!tmp) continue;
                outText += `${tmp} | `
            }
            if (outText.length > 2) {
                outText = outText.substring(0, outText.length-3)
            }
            log("WILL USE OUT TEXT:");
            log(outText);
            this.sensorsPanelText.text = outText;
        } catch (error) {
            logError(error, "Could not refresh sensor stats...");
            // will execute this function only once and abort. 
            // Remove in order to make the Main loop continue working.
            return false;
        }
        // By returning true, the function will continue refresing every X seconds
        return true; 
    }

    _getPanelSensorData(entity_id) {
        let json_result = Utils.send_request(`${this.base_url}api/states/${entity_id}`);
        if (!json_result) {
            return false;
        }
        return `${json_result.state} ${json_result.attributes.unit_of_measurement}`;
    }

    _needsRebuildTempPanel(tempPanelNeedsRebuild) {
        let tmp;

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

    _needsRebuildSensorPanel(trayNeedsRebuild){
        let tmp;
        // Check togglable ids
        tmp = this.panelSensorIds;
        this.panelSensorIds = this._settings.get_strv(HASS_ENABLED_SENSOR_IDS);
        if (!Utils.arraysEqual(tmp, this.panelSensorIds)) {
            trayNeedsRebuild = true;
        }
        return trayNeedsRebuild;

    }

    _deleteTempStatsPanel() {

        if (this.weatherStatsPanel !== undefined) {
            Main.panel._rightBox.remove_child(this.weatherStatsPanel);
            if (this.doRefresh === true) {
                Mainloop.source_remove(this.refreshTimeout);
            }
        }
    }

    _deleteSensorsPanel() {
        if (this.sensorsPanel) {
            Main.panel._rightBox.remove_child(this.sensorsPanel);
        }
    }
})


function init() {
  Convenience.initTranslations();
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
    hassExtension._deleteSensorsPanel();
    hassExtension.destroy();
    hassExtension = null;

    // Disable shortcut
    Main.wm.removeKeybinding("hass-shortcut");
}
