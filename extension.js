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

var HassPanelSensor = GObject.registerClass ({
    GTypeName: "HassPanelSensor"
}, class HassPanelSensor extends St.Bin {

    _init(entity, force_reload=false) {
        super._init({
            style_class : "panel-button",
            reactive : true,
            can_focus : true,
            track_hover : true,
            height : 30,
            visible: true,
        });
        this.entity = entity;

        this.label = new St.Label({
            text : force_reload ? this.computePlaceholderText() : this.computeLabelText(),
            y_align: Clutter.ActorAlign.CENTER,
            style: "spacing: 2px",
        });
        this.set_child(this.label);
        this.connect("button-press-event", () => this.refresh(true));

        if (force_reload)
            this.refresh(true);

        this.build_tooltip();

        // Import settings to have access to its constants
        // Note: we can't do that globally.
        this.Settings = Me.imports.settings;
        this.connectedSettingIds = Utils.connectSettings([this.Settings.HASS_ENTITIES_CACHE], this.refresh.bind(this));
    }

    build_tooltip() {
        this.tooltip = new St.Label({
            text: this.entity.name,
            visible: false,
            style_class: "hass-sensor-tooltip",
        });
        Main.layoutManager.uiGroup.add_child(this.tooltip);
        Main.layoutManager.uiGroup.set_child_above_sibling(this.tooltip, null);

        this.set_track_hover(true);
        this.connect('style-changed', (self) => {
            if(self.hover) {
                let [x, y] = this.get_transformed_position();
                let w = this.tooltip.get_width();
                let h = this.tooltip.get_height();
                this.tooltip.set_position(
                    x + Math.round(this.get_width() / 2) - Math.round(w / 2),
                    y + Math.round(1.3 * h)
                );
                this.tooltip.show();
                this.tooltip.ease({
                    opacity: 200,
                    duration: 300,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            }
            else {
                this.tooltip.remove_all_transitions();
                this.tooltip.ease({
                    opacity: 0,
                    duration: 100,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    onComplete: () => this.tooltip.hide(),
                });
            }
        });
    }

    refresh(force_reload=false, entity=null) {
        if (entity) {
            this.entity = entity;
            this.label.text = this.computeLabelText();
            this.tooltip.text = this.entity.name;
            return;
        }
        Utils.getSensor(
            this.entity.entity_id,
            (entity) => this.refresh(false, entity),
            () => {
                Utils._log(
                    'Fail to load %s (%s) sensor state',
                    [this.entity.name, this.entity.entity_id]
                );
                this.label.text = this.computePlaceholderText();
            },
            force_reload
        );
    }

    computeLabelText() {
        return `${this.entity.state} ${this.entity.unit}`;
    }

    computePlaceholderText() {
        return `- ${this.entity.unit}`;
    }

    destroy() {
        Utils.disconnectSettings(this.connectedSettingIds);
        this.label.destroy();
        this.tooltip.destroy();
        super.destroy();
    }

});

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

        this.panelSensorBox = null;
        this.panelSensors = [];
        this.refreshSensorsTimeout = null;

        this.connectedSettingIds = [];
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
        this._buildPanelSensors();
        this._buildTrayIcon();
        this._enableShortcut();

        // Add the main box as child of the PopupMenu
        this.add_child(this.box);

        // Connect the setting field that contain the HASS URL with the refresh() method with
        // force_reload argument equal to true
        this._connectSettings([this.Settings.HASS_URL], this.refresh, [true]);

        // Connect the setting field that contain the HASS entities state cache with the refresh()
        // method with force_reload argument equal to false (default)
        this._connectSettings([this.Settings.HASS_ENTITIES_CACHE], this.refresh);
    }

    disable () {
        Utils._log("disabling...");
        Utils.disconnectSettings(this.connectedSettingIds);
        this._deletePanelSensors();
        this._deleteTrayIcon();
        this._disableShortcut();
        this._deleteMenuItems();
        if (this.panelSensorBox) this.panelSensorBox.destroy();
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
            this._refreshPanelSensors();
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
        if (this.refreshSensorsTimeout) {
            Mainloop.source_remove(this.refreshSensorsTimeout);
            this.refreshSensorsTimeout = null;
        }
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
        this.connectedSettingIds.push.apply(
            this.connectedSettingIds,
            Utils.connectSettings(
                settings,
                function() {
                    this._loadSettings();
                    callback.apply(this, args);
                }.bind(this)
            )
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

        // Refresh togglable items a first time
        this._refreshTogglable();

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
     * Panel sensors
     **********************************************************************************************
     */

    _buildPanelSensors() {
        Utils._log("build sensors panel...");

        // Create a box for panel sensors and add it to main box
        this.panelSensorBox = new St.BoxLayout();
        this.box.add_child(this.panelSensorBox);

        // Rebuild panel sensors item a first time (with force reload enabled)
        this._rebuildPanelSensors(true);

        // Connect the setting field that contain enabled sensors with the _rebuildPanelSensors()
        // method
        this._connectSettings([this.Settings.HASS_ENABLED_SENSOR_IDS], this._rebuildPanelSensors);

        // Configure the refreshing of sensors panel
        this._configPanelSensorsRefresh();

        // Connect all setting fields that have impact on the refreshing of sensors panel with
        // the _configPanelSensorsRefresh() method
        this._connectSettings(
            [
                this.Settings.HASS_ENABLED_SENSOR_IDS,
                this.Settings.DO_REFRESH,
                this.Settings.REFRESH_RATE,
            ],
            this._configPanelSensorsRefresh
        );

        Utils._log("panel sensor builded...");
    }

    _rebuildPanelSensors(force_reload=false) {
        Utils._log("Rebuild panel sensors...");
        Utils.getSensors(
            function(panelSensors) {
                Utils._log("Get enabled sensors, rebuild panel...");
                let panelSensorsIds = panelSensors.map((p) => p.entity_id);

                // Firstly, remove all panel sensors from their box and destroy removed sensors
                for (let [panelSensorId, panelSensor] of Object.entries(this.panelSensors)) {
                    this.panelSensorBox.remove_child(panelSensor);
                    if (!panelSensorsIds.includes(panelSensorId)) {
                        Utils._log("Remove sensor %s (%s) from panel", [panelSensor.entity.name, panelSensor.entity.entity_id]);
                        panelSensor.destroy();
                        delete this.panelSensors[panelSensorId];
                    }
                }

                // Now refresh existing sensors, create new ones and put them in their box
                for (let [idx, panelSensor] of panelSensors.entries()) {
                    if (panelSensor.entity_id in this.panelSensors) {
                        Utils._log("Refresh sensor %s (%s) in panel", [panelSensor.name, panelSensor.entity_id]);
                        this.panelSensors[panelSensor.entity_id].refresh(force_reload, panelSensor);
                    }
                    else {
                        Utils._log("Add sensor %s (%s) to panel", [panelSensor.name, panelSensor.entity_id]);
                        this.panelSensors[panelSensor.entity_id] = new HassPanelSensor(panelSensor, force_reload);
                    }
                    this.panelSensorBox.add_child(this.panelSensors[panelSensor.entity_id]);
                }
                Utils._log("Panel sensors rebuilded");
            }.bind(this),
            function() {
                Utils._log("fail to load enabled panel sensors, remove all", null, true);
                this._deletePanelSensors();
            }.bind(this),
            true,  // we want only enabled sensors
        );
    }

    _configPanelSensorsRefresh() {
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
            this._refreshPanelSensors(true);
            // We have to return true to keep the timer alive
            return true;
        });
    }

    _refreshPanelSensors(force_reload=false) {
        for (let panelSensor of Object.values(this.panelSensors))
            panelSensor.refresh(force_reload);
    }

    _deletePanelSensors() {
        for (let [panelSensorId, panelSensor] of Object.entries(this.panelSensors)) {
            this.box.remove_child(panelSensor);
            panelSensor.destroy();
            delete this.panelSensors[panelSensorId];
        }
    }

})

class Extension {
    constructor() {
        this.popupMenu = null;
    }

    enable() {
    	Utils.init();
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
        Utils.disable();
    }
}

function init() {
    ExtensionUtils.initTranslations();
    return new Extension();
}
