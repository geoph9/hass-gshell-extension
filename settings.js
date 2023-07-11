const {Gio, Gtk, GObject, Secret} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

var PANEL_ICON_PATH = 'default-panel-icon';
var VALID_PANEL_ICONS = 'valid-panel-icons';
var HASS_URL = 'hass-url';
var HASS_ENTITIES_CACHE = 'hass-entities-cache';
var HASS_ENABLED_ENTITIES = 'hass-enabled-entities';
var HASS_ENABLED_SENSOR_IDS = 'hass-enabled-sensor-ids';
var SHOW_NOTIFICATIONS_KEY = 'show-notifications';
var DO_REFRESH = 'sensors-refresh';
var REFRESH_RATE = 'sensors-refresh-seconds';
var DEBUG_MODE = 'debug-mode';

var MscOptions = class MscOptions {
    constructor() {
        this._gsettings = Utils.getSettings();
        this._connectionIds = [];
    }

    connect(name, callback) {
        const id = this._gsettings.connect(name, callback);
        this._connectionIds.push(id);
        return id;
    }

    destroy() {
        this._connectionIds.forEach(id => this._gsettings.disconnect(id));
    }

    // Panel Icons
    get panelIcon() {
        return this._gsettings.get_string(PANEL_ICON_PATH);
    }
    set panelIcon(icon_path) {
        this._gsettings.set_string(PANEL_ICON_PATH, icon_path);
    }
    get validIcons() {
        return this._gsettings.get_strv(VALID_PANEL_ICONS);
    }
    set validIcons(icon_paths) {
        this._gsettings.set_strv(VALID_PANEL_ICONS, icon_paths);
    }

    // General Settings
    get hassUrl() {
        return this._gsettings.get_string(HASS_URL);
    }
    set hassUrl(bool_val) {
        this._gsettings.set_string(HASS_URL, bool_val);
    }

    get doRefresh() {
        return this._gsettings.get_boolean(DO_REFRESH);
    }
    set doRefresh(bool_val) {
        this._gsettings.set_boolean(DO_REFRESH, bool_val);
    }

    get refreshRate() {
        return this._gsettings.get_string(REFRESH_RATE);
    }
    set refreshRate(rate) {
        this._gsettings.set_string(REFRESH_RATE, rate);
    }

    // Entities cache
    get entitiesCache() {
        return this._gsettings.get_strv(HASS_ENTITIES_CACHE).map(ent => JSON.parse(ent));
    }
    set entitiesCache(entities) {
        this._gsettings.set_strv(HASS_ENTITIES_CACHE, entities.map(ent => JSON.stringify(ent)));
    }

    // Togglable entities of menu
    get enabledEntities() {
        return this._gsettings.get_strv(HASS_ENABLED_ENTITIES);
    }
    set enabledEntities(entities) {
        this._gsettings.set_strv(HASS_ENABLED_ENTITIES, entities);
    }

    // Panel extra sensors
    get enabledSensors() {
        return this._gsettings.get_strv(HASS_ENABLED_SENSOR_IDS);
    }
    set enabledSensors(entities) {
        this._gsettings.set_strv(HASS_ENABLED_SENSOR_IDS, entities);
    }

    // Debug mode
    get debugMode() {
        return this._gsettings.get_boolean(DEBUG_MODE);
    }
    set debugMode(bool_val) {
        this._gsettings.set_boolean(DEBUG_MODE, bool_val);
    }

    // Show notifications
    get showNotifications() {
        return this._gsettings.get_boolean(SHOW_NOTIFICATIONS_KEY);
    }
    set showNotifications(bool_val) {
        this._gsettings.set_boolean(SHOW_NOTIFICATIONS_KEY, bool_val);
    }

}
