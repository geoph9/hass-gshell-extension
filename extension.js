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
var HassMenu = GObject.registerClass ({
    GTypeName: "HassMenu"
}, class HassMenu extends PanelMenu.Button {
    _init() {
        super._init(0, Me.metadata.name, false);
        this.style_class = 'hass-menu';
        this._settings = ExtensionUtils.getSettings();
        this.Settings = null;
        this.shortcutId = "hass-shortcut";

        this.box = null;

        this.trayButton = null;
        this.trayIcon = null;

        this.togglablesMenuItems = [];
        this.togglablesMenuSeparatorItem = null;

        this.sensorsPanel = null;
        this.sensorsPanelText = null;
        this.refreshSensorsTimeout = null;
    }

    enable() {
        Utils._log("enabling...");

        // Import settings to have access to its constants
        // Note: we can't do that globally.
        this.Settings = Me.imports.settings;

        // Disable click event on the PopupMenu to handle it in the components it contains
        this.connect('event', (actor, event) => {
            if ((event.type() == Clutter.EventType.TOUCH_BEGIN ||
                 event.type() == Clutter.EventType.BUTTON_PRESS))
                return Clutter.EVENT_STOP;
            return Clutter.EVENT_PROPAGATE;
        });

        // Create the main BoxLayout which will contain all compoments of the extension
        this.box = new St.BoxLayout({style: 'spacing: 2px'});

        // Load settings and build all compoments
        this._loadSettings();
        this._buildTrayMenu();
        this._buildSensorsPanel();
        this._buildTrayIcon();
        this._enableShortcut();

        // Add the main box as child of the PopupMenu
        this.add_child(this.box);

        // Now we could manage the content of the extension compoents. Firstly, update the entities
        // cache
        Utils.getEntities(
            function (entities) {
                this.refresh(true);
            }.bind(this),
            function () {
                Utils._log("fail to refresh entities cache, invalidate it", null, true);
                Utils.invalidateEntitiesCache();
            }.bind(this),
            true  // force refreshing the cache
        );

        // Connect the setting field that contain the HASS URL with the refresh() method with
        // force_reload argument equal to true
        this._connectSettings([this.Settings.HASS_URL], this.refresh, [true]);

        // Connect the setting field that contain the HASS entities state cache with the refresh()
        // method with force_reload argument equal to false (default)
        this._connectSettings([this.Settings.HASS_ENTITIES_CACHE], this.refresh);
    }

    disable () {
        Utils._log("disabling...");
        this._deleteSensorsPanel();
        this._deleteTrayIcon();
        this._disableShortcut();
        this._deleteMenuItems();
        if (this.box) this.box.destroy();
    }

    refresh(force_reload=false) {
        if (force_reload) {
            Utils.getEntities(
                // We do not have to trigger a refresh() here, because on success, cache setting
                // will be updated and a refresh will be automatically triggered. So no on-success
                // callback here.
                null,
                function () {
                    Utils._log("fail to refresh entities cache, invalidate it.", null, true);
                    Utils.invalidateEntitiesCache();
                }.bind(this),
                true  // force refreshing cache
            );
        }
        else {
            this._refreshTogglable();
            this._refreshSensorsPanel();
        }
    }

    /*
     **********************************************************************************************
     * Shortcut
     **********************************************************************************************
     */

    _enableShortcut() {
        Main.wm.addKeybinding(
            this.shortcutId,
            ExtensionUtils.getSettings('org.gnome.shell.extensions.hass-shortcut'),
            Meta.KeyBindingFlags.NONE,  // key binding flag
            Shell.ActionMode.ALL,  // binding mode
            () => this.menu.toggle()
        );
    }
    _disableShortcut() {
        Main.wm.removeKeybinding(this.shortcutId);
    }

    /*
     **********************************************************************************************
     * Manage settings
     **********************************************************************************************
     */

    _loadSettings() {
        Utils._log("load settings");
        this.panelSensorIds = this._settings.get_strv(this.Settings.HASS_ENABLED_SENSOR_IDS);
        this.doRefresh = this._settings.get_boolean(this.Settings.DO_REFRESH);
        this.refreshSeconds = Number(this._settings.get_string(this.Settings.REFRESH_RATE));
    }

    _connectSettings(settings, callback, args=[]) {
        Utils.connectSettings(
            settings,
            function() {
                this._loadSettings();
                callback.apply(this, args);
            }.bind(this)
        );
    }

    /*
     **********************************************************************************************
     * Tray icon
     **********************************************************************************************
     */

    _getTrayIconPath() {
        let icon_path = this._settings.get_string(this.Settings.PANEL_ICON_PATH);
        // Make sure the path is valid
        if (!icon_path.startsWith("/"))
            icon_path = "/" + icon_path;
        return Me.dir.get_path() + icon_path;
    }

    _buildTrayIcon() {
        this.trayButton = new St.Bin({
            style_class : "panel-button",
            reactive : true,
            can_focus : true,
            track_hover : true,
            height : 30,
        });


        this.trayIcon = new St.Icon({
            gicon : Gio.icon_new_for_string(this._getTrayIconPath()),
            style_class : 'system-status-icon',
        });

        this.trayButton.set_child(this.trayIcon);
        this.trayButton.connect("button-press-event", () => this.menu.toggle());

        this.box.add_child(this.trayButton);

        // Connect the setting field that contain the selected icon with the _updateTrayIcon()
        // method
        this._connectSettings([this.Settings.PANEL_ICON_PATH], this._updateTrayIcon);
    }

    _updateTrayIcon() {
        this.trayIcon.gicon = Gio.icon_new_for_string(this._getTrayIconPath());
    }

    _deleteTrayIcon() {
        if (this.trayIcon) {
            this.trayIcon.destroy();
            this.trayIcon = null;
        }
        if (this.trayButton) {
            this.trayButton.destroy();
            this.trayButton = null;
        }
    }

    /*
     **********************************************************************************************
     * Tray menu
     **********************************************************************************************
     */

    _buildTrayMenu() {
        Utils._log("build tray menu");

        // Build the submenu containing the HASS events
        let subItem = new PopupMenu.PopupSubMenuMenuItem(_('HASS Events'), true);
        subItem.icon.gicon = Gio.icon_new_for_string(Me.dir.get_path() + '/icons/hass-symbolic.svg');
        this.menu.addMenuItem(subItem);

        let start_hass_item = new PopupMenu.PopupMenuItem(_('Start Home Assistant'));
        subItem.menu.addMenuItem(start_hass_item);
        start_hass_item.connect('activate', () => Utils.triggerHassEvent('start'));

        let stop_hass_item = new PopupMenu.PopupMenuItem(_('Stop Home Assistant'));
        subItem.menu.addMenuItem(stop_hass_item);
        stop_hass_item.connect('activate', () => Utils.triggerHassEvent('stop'));

        let close_hass_item = new PopupMenu.PopupMenuItem(_('Close Home Assistant'));
        subItem.menu.addMenuItem(close_hass_item, 2);
        close_hass_item.connect('activate', () => Utils.triggerHassEvent('close'));

        // Build the Refresh menu item
        let refreshMenuItem = new PopupMenu.PopupImageMenuItem(_("Refresh"), 'view-refresh');
        refreshMenuItem.connect('activate', () => {
            // Firstly close the menu to avoid artifact when it will partially be rebuiled
            this.menu.close();
            Utils._log("Refreshing...");
            this.refresh(true);
        });
        this.menu.addMenuItem(refreshMenuItem);

        // Build the Preferences menu item
        let prefsMenuItem = new PopupMenu.PopupImageMenuItem(
            _("Preferences"),
            'security-high-symbolic',
        );
        prefsMenuItem.connect('activate', () => {
            Utils._log("opening Preferences...");
            ExtensionUtils.openPrefs();
        });
        this.menu.addMenuItem(prefsMenuItem);

        // Connect the setting field that contain enabled togglable entities with the
        // _refreshTogglable() method
        this._connectSettings([this.Settings.HASS_ENABLED_ENTITIES], this._refreshTogglable);

        Utils._log("tray menu builded");
    }

    _refreshTogglable(force_reload=false) {
        Utils._log("refresh togglables in tray menu...");

        // Firstly delete previously created togglable menu items
        this._deleteTogglablesMenuItems();

        // Now get the togglable entities and continue in callback
        Utils.getTogglables(
            function(togglables) {
                Utils._log("get enabled togglables, continue refreshing tray menu");
                this.togglablesMenuItems = [];
                for (let [idx, entity] of togglables.entries()) {
                    if (entity.entity_id === "" || !entity.entity_id.includes("."))
                        continue
                    let pmItem = new PopupMenu.PopupImageMenuItem(
                        _('Toggle:') + ' ' + entity.name,
                        Utils.getTogglableEntityIcon(entity),
                    );
                    pmItem.connect('activate', () => {
                        Utils.toggleEntity(entity)
                    });
                    this.togglablesMenuItems.push({item: pmItem, entity: entity, index: idx});

                    // We insert here the togglable menu items with their index as position to put
                    // them at the top of the popup menu
                    this.menu.addMenuItem(pmItem, idx);
                }
                // If we have at least one togglable item in menu, add the separator
                if (this.togglablesMenuItems.length) {
                    this.togglablesMenuSeparatorItem = new PopupMenu.PopupSeparatorMenuItem();
                    this.menu.addMenuItem(
                        this.togglablesMenuSeparatorItem,
                        // use the togglables count as position of the separator in the menu
                        this.togglablesMenuItems.length
                    );
                }
                Utils._log("togglables in tray menu refreshed");
            }.bind(this),
            // On error callback
            () => Utils._log("fail to load enabled togglables", null, true),
            true,  // we want only enabled togglables
            force_reload
        );
    }

    _deleteTogglablesMenuItems() {
        // Destroy the previously created togglable menu items
        for (let ptItem of this.togglablesMenuItems)
            ptItem.item.destroy();
        this.togglablesMenuItems = [];
        if (this.togglablesMenuSeparatorItem) {
            this.togglablesMenuSeparatorItem.destroy();
            this.togglablesMenuSeparatorItem = null;
        }
    }

    _deleteMenuItems() {
        // Delete all the menu items
        this._deleteTogglablesMenuItems();
        this.menu.removeAll();
    }

    /*
     **********************************************************************************************
     * Sensors panel
     **********************************************************************************************
     */

    _buildSensorsPanel() {
        Utils._log("build sensors panel...");
        this.sensorsPanel = new St.Bin({
            style_class : "panel-button",
            reactive : true,
            can_focus : true,
            track_hover : true,
            height : 30,
            visible: false,
        });
        this.sensorsPanelText = new St.Label({
            text : "",
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.sensorsPanel.set_child(this.sensorsPanelText);
        this.sensorsPanel.connect("button-press-event", () => this._refreshSensorsPanel(true));
        this.box.add_child(this.sensorsPanel);

        // Connect the setting field that contain enabled sensors with the _refreshSensorsPanel()
        // method
        this._connectSettings([this.Settings.HASS_ENABLED_SENSOR_IDS], this._refreshSensorsPanel);

        // Configure the refreshing of sensors panel
        this._configSensorsPanelRefresh();

        // Connect all setting fields that have impact on the refreshing of sensors panel with
        // the _configSensorsPanelRefresh() method
        this._connectSettings(
            [
                this.Settings.HASS_ENABLED_SENSOR_IDS,
                this.Settings.DO_REFRESH,
                this.Settings.REFRESH_RATE,
            ],
            this._configSensorsPanelRefresh
        );

        Utils._log("panel sensor builded...");
    }

    _configSensorsPanelRefresh() {
        // Firstly cancel previous configured timeout (if defined)
        if (this.refreshSensorsTimeout) {
            Utils._log("cancel previous sensors refresh timer...");
            Mainloop.source_remove(this.refreshSensorsTimeout);
            this.refreshSensorsTimeout = null;
        }

        // Only continue if refreshing is enabled, refreshing rate is configured and we have at
        // least one panel sensors configured
        if (!this.doRefresh || !this.refreshSeconds || !this.panelSensorIds.length)
            return;

        // Schedule sensors panel refreshing every X seconds
        Utils._log(
            'schedule refreshing sensors panel every %s seconds',
            [this.refreshSeconds]
        );
        this.refreshSensorsTimeout = Mainloop.timeout_add_seconds(this.refreshSeconds, () => {
            this._refreshSensorsPanel(true);
            // We have to return true to keep the timer alive
            return true;
        });
    }

    _refreshSensorsPanel(force_reload=false) {
        // Get enabled panel sensors and continue in callback
        Utils.getSensors(
            function(panelSensors) {
                Utils._log("refresh sensors panel");
                if (panelSensors.length === 0) {
                    Utils._log("no sensor enabled for the panel, hide it");
                    this.sensorsPanel.visible = false;
                    return;
                }

                try {
                    let outText = [];
                    for (let sensor of panelSensors)
                        outText.push(Utils.computeSensorState(sensor));
                    Utils._log('refreshed panel sensors value = "%s"', [outText.join(' | ')]);
                    this.sensorsPanelText.text = outText.join(' | ');
                    this.sensorsPanel.visible = true;
                } catch (error) {
                    logError(error, `${MyUUID}: Fail to compute sensors panel text, hide it`);
                    this.sensorsPanel.visible = false;
                }
            }.bind(this),
            function() {
                Utils._log("fail to load enabled panel sensors, hide it", null, true);
                this.sensorsPanel.visible = false;
            }.bind(this),
            true,  // we want only enabled sensors
            force_reload
        );
    }

    _deleteSensorsPanel() {
        if (this.sensorsPanelText) {
            this.sensorsPanelText.destroy();
            this.sensorsPanelText = null;
        }
        if (this.sensorsPanel) {
            this.sensorsPanel.destroy();
            this.sensorsPanel = null;
        }
    }

})

class Extension {
    constructor() {
        this.popupMenu = null;
    }

    enable() {
        Utils._log("enabling...");

        this.popupMenu = new HassMenu();
        this.popupMenu.enable()

        Main.panel.addToStatusArea('hass-extension', this.popupMenu);
    }

    disable() {
        Utils._log("disabling...");

        this.popupMenu.disable();
        this.popupMenu.destroy();
        this.popupMenu = null;
    }
}

function init() {
    Utils._log("initializing...");
    ExtensionUtils.initTranslations();
    return new Extension();
}
