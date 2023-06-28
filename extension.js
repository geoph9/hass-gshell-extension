const {Gio, Shell, Meta, St, Clutter, Secret, GLib, Soup, GObject} = imports.gi;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
// const Util = imports.misc.util;
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

// MainLoop for updating the time every X seconds.
const Mainloop = imports.mainloop;
const Utils = Me.imports.utils;

const MyUUID = Me.metadata.uuid;

// Credits for organizing this class: https://github.com/vchlum/hue-lights/
var HassExtension = GObject.registerClass ({
    GTypeName: "HassMenu"
}, class HassMenu extends PanelMenu.Button {
    _init() {
        super._init(0, Me.metadata.name, false);
        this._settings = ExtensionUtils.getSettings();
    }

    enable() {
        Main.panel.addToStatusArea('hass-extension', this, 1);
        this.enableShortcut();

        this._settings.connect("changed", () => {
            log(`${MyUUID}: configuration updated, trigger refresh`);
            this.refresh();
        });

        // Add tray icon
        let Settings = Me.imports.settings;
        let icon_path = this._settings.get_string(Settings.PANEL_ICON_PATH);
        // Make sure the path is valid
        icon_path = icon_path.startsWith("/") ? icon_path : "/" + icon_path;
        let icon = new St.Icon({
            gicon : Gio.icon_new_for_string( Me.dir.get_path() + icon_path),
            style_class : 'system-status-icon',
        });
        this.add_child(icon);

        // Firstly, update entities cache
        Utils.getEntities(
            function (entities) {
                this.refresh(true);
            }.bind(this),
            function () {
                log(`${MyUUID}: Fail to refresh entities cache, invalidate it`);
                Utils.invalidateEntitiesCache();
                // We still have to display the extension
                this.refresh(true);
            }.bind(this),
            true
        );
    }

    enableShortcut() {
        // For the Shortcut
        // Shell.ActionMode.NORMAL
        // Shell.ActionMode.OVERVIEW
        // Shell.ActionMode.LOCK_SCREEN
        let mode = Shell.ActionMode.ALL;

        // Meta.KeyBindingFlags.PER_WINDOW
        // Meta.KeyBindingFlags.BUILTIN
        // Meta.KeyBindingFlags.IGNORE_AUTOREPEAT
        let flag = Meta.KeyBindingFlags.NONE;

        let shortcut_settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.hass-shortcut');

        Main.wm.addKeybinding("hass-shortcut", shortcut_settings, flag, mode, () => {
            this.menu.toggle();
        });
    }

    disable () {
        this._deleteTempStatsPanel();
        this._deleteSensorsPanel();
        this.disableShortcut();
        this.destroy();
    }

    disableShortcut() {
        Main.wm.removeKeybinding("hass-shortcut");
    }

    refresh(force=false) {
        if (this.needsRebuild() || force) {
            this.rebuildTray();
            this.buildTempSensorStats();
            this.buildPanelSensorEntities();
        }
    }

    rebuildTray() {
        log(`${MyUUID}: Rebuilding tray...`);
        // Destroy the previous menu items
        let oldItems = this.menu._getMenuItems();
        for (let item in oldItems) {
            oldItems[item].destroy();
        }

        let completeTrayMenu = function() {
            log(`${MyUUID}: Complete tray menu`);
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
                log(`${MyUUID}: Opening Preferences...`);
                ExtensionUtils.openPrefs();
            });
            this.menu.addMenuItem(popupImageMenuItem);
            log(`${MyUUID}: tray rebuilded`);
        }.bind(this);

        // Get the togglable entities and continue in callback
        Utils.getTogglables(
            function(togglables) {
                log(`${MyUUID}: get enabled togglables, continue rebuilding tray`);
                // I am using an array of objects because I want to get a full copy of the
                // pmItem and the entityId. If I don't do that then the pmItem will be connected
                // only to the laste entry of 'togglable_ent_ids' which means that whichever entry
                // of the menu you press, you will always toggle the same button
                var pmItems = [];
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
                completeTrayMenu.bind(this)();
            }.bind(this),
            function () {
                log(`${MyUUID}: Fail to load enabled togglables`);
                completeTrayMenu();
            }.bind(this),
            true
        );
    }

    buildPanelSensorEntities() {
        // Get enabled panel sensors and continue in callback
        Utils.getSensors(
            function(panelSensors) {
                if (panelSensors.length === 0) {
                    log(`${MyUUID}: No panel sensor enabled`);
                    this._deleteSensorsPanel();
                    return;
                }

                if (this.sensorsPanel === undefined) {
                    log(`${MyUUID}: Add sensors to panel`);
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
                        this._needsRebuildSensorPanel();
                        this._refreshPanelSensors();
                    });
                }

                this._refreshPanelSensors(panelSensors);

                Main.panel._rightBox.insert_child_at_index(this.sensorsPanel, 1);
            }.bind(this),
            function() {
                log(`${MyUUID}: Fail to load enabled panel sensors`);
                this._deleteSensorsPanel();
            }.bind(this),
            true
        );
    }

    buildTempSensorStats() {
        if (this.showWeatherStats === true && this.tempEntityID) {
            Utils.getSensor(
                this.tempEntityID,
                function (temp_sensor) {
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

                    // Refresh is done in enable(), don't force reload in this case
                    this._refreshWeatherStats(temp_sensor);

                    if (this.doRefresh === true) {
                        // Update weather stats every X seconds
                        this.refreshTimeout = Mainloop.timeout_add_seconds(this.refreshSeconds,  () => {
                            this._needsRebuildTempPanel();
                            this._refreshWeatherStats();
                        });
                    }

                    Main.panel._rightBox.insert_child_at_index(this.weatherStatsPanel, 1);
                }.bind(this),
                function() {
                    log(`${MyUUID}: fail to retreive temperature sensor`);
                    this._deleteTempStatsPanel();
                }.bind(this)
            );
        } else {
            this._deleteTempStatsPanel();
        }
    }

    needsRebuild() {
        let trayNeedsRebuild = false;
        let tmp;

        // Check if the hass url changed.
        tmp = this.base_url;
        this.base_url = Utils.computeURL();
        trayNeedsRebuild = trayNeedsRebuild || (tmp !== this.base_url);

        // Check togglable ids
        let Settings = Me.imports.settings;
        tmp = this.togglable_ent_ids;
        this.togglable_ent_ids = this._settings.get_strv(Settings.HASS_ENABLED_ENTITIES);
        trayNeedsRebuild = trayNeedsRebuild || !Utils.arraysEqual(tmp, this.togglable_ent_ids);

        // Do the same for all of the weather entities
        trayNeedsRebuild = this._needsRebuildTempPanel() || trayNeedsRebuild;
        // Do the same for all extra sensor entities
        trayNeedsRebuild = this._needsRebuildSensorPanel() || trayNeedsRebuild;

        return trayNeedsRebuild;
    }

    _toggleEntity(entityId) {
        let data = { "entity_id": entityId };
        let domain = entityId.split(".")[0];  // e.g. light.mylight => light
        Utils.send_async_request(Utils.computeURL(`api/services/${domain}/toggle`), 'POST', data);
    }

    _triggerHassEvent(event) {
        Utils.send_async_request(Utils.computeURL(`api/events/homeassistant_${event}`), 'POST');
    }

    _refreshWeatherStats(temp_sensor=null) {
        let update = function(sensor) {
            let out = Utils.computeSensorState(sensor);
            if (this.showHumidity === true) {
                log(`${MyUUID}: get humidity sensor (${this.humidityEntityID})`);
                Utils.getSensor(
                    this.humidityEntityID,
                    function(sensor) {
                        out += ` | ${Utils.computeSensorState(sensor)}`;
                        log(`${MyUUID}: update weather in panel with temperature & humidity sensor`);
                        this.weatherStatsPanelText.text = out;
                    }.bind(this),
                    function() {
                        log(`${MyUUID}: fail to retreive humidity sensor, update weather in panel with only temperature`);
                        this.weatherStatsPanelText.text = out;
                    }.bind(this)
                );
            }
            else {
                log(`${MyUUID}: update weather in panel with temperature`);
                this.weatherStatsPanelText.text = out;
            }
        }.bind(this);

        if (temp_sensor) {
            update(temp_sensor);
            return;
        }
        log(`${MyUUID}: get temperature sensor (${this.tempEntityID})`);
        Utils.getSensor(
            this.tempEntityID,
            update,
            function() {
                log(`${MyUUID}: fail to retreive temperature sensor`);
            },
            true
        );
    }

    _refreshPanelSensors(sensorEntities=null) {
        let update = function(sensorEntities) {
            log(`${MyUUID}: refresh panel sensors`);
            try {
                let outText = [];
                let tmp;
                for (let sensor of sensorEntities) {
                    outText.push(Utils.computeSensorState(sensor));
                }
                log(`${MyUUID}: WILL USE OUT TEXT:`);
                log(`${MyUUID}: ${outText.join(' | ')}`);
                this.sensorsPanelText.text = outText.join(' | ');
            } catch (error) {
                logError(error, `${MyUUID}: Could not refresh sensor stats...`);
                // will execute this function only once and abort.
                // Remove in order to make the Main loop continue working.
                return false;
            }
        }.bind(this);

        if (sensorEntities) {
            update(sensorEntities);
            return;
        }

        Utils.getSensors(update, null, true, true);
    }

    _needsRebuildTempPanel() {
        let Settings = Me.imports.settings;
        let needRebuild = false;
        let tmp;

        // Check show weather stats
        tmp = this.showWeatherStats;
        this.showWeatherStats = this._settings.get_boolean(Settings.SHOW_WEATHER_STATS);
        needRebuild = needRebuild || (tmp !== this.showWeatherStats);

        // Check show humidity
        tmp = this.showHumidity;
        this.showHumidity = this._settings.get_boolean(Settings.SHOW_HUMIDITY);
        needRebuild = needRebuild || (tmp !== this.showHumidity);

        // Check temperature id change
        tmp = this.tempEntityID;
        this.tempEntityID = this._settings.get_string(Settings.TEMPERATURE_ID);
        needRebuild = needRebuild || (tmp !== this.tempEntityID);

        // Check humidity id change
        tmp = this.humidityEntityID;
        this.humidityEntityID = this._settings.get_string(Settings.HUMIDITY_ID);
        needRebuild = needRebuild || (tmp !== this.humidityEntityID);

        // Check refresh seconds changed
        tmp = this.refreshSeconds;
        this.refreshSeconds = Number(this._settings.get_string(Settings.REFRESH_RATE));
        needRebuild = needRebuild || (tmp !== this.refreshSeconds);

        // Check doRefresh
        tmp = this.doRefresh;
        this.doRefresh = this._settings.get_boolean(Settings.DO_REFRESH);
        needRebuild = needRebuild || (tmp !== this.doRefresh);

        return needRebuild;
    }

    _needsRebuildSensorPanel(){
        // Check togglable ids
        let Settings = Me.imports.settings;
        let tmp = this.panelSensorIds;
        this.panelSensorIds = this._settings.get_strv(Settings.HASS_ENABLED_SENSOR_IDS);
        return !Utils.arraysEqual(tmp, this.panelSensorIds);
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
    log(`${MyUUID}: initializing...`);
    ExtensionUtils.initTranslations();
    return new HassExtension();
}
