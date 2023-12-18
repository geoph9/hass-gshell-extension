import Gio from 'gi://Gio';
// const {Gio, Gtk, GObject, Secret} = imports.gi;
// import Gtk from 'gi://Gtk';
// import GObject from 'gi://GObject';
// import Secret from 'gi://Secret';

// const ExtensionUtils = imports.misc.extensionUtils;
// const Me = ExtensionUtils.getCurrentExtension();
// const Utils = Me.imports.utils;

export var PANEL_ICON_PATH = 'default-panel-icon';
export var VALID_PANEL_ICONS = 'valid-panel-icons';
export var HASS_URL = 'hass-url';
export var HASS_ENTITIES_CACHE = 'hass-entities-cache';
export var HASS_ENABLED_ENTITIES = 'hass-enabled-entities';
export var HASS_ENABLED_RUNNABLES = 'hass-enabled-runnables';
export var HASS_ENABLED_SENSOR_IDS = 'hass-enabled-sensor-ids';
export var SHOW_NOTIFICATIONS_KEY = 'show-notifications';
export var DO_REFRESH = 'sensors-refresh';
export var REFRESH_RATE = 'sensors-refresh-seconds';
export var DEBUG_MODE = 'debug-mode';

export var MscOptions = class MscOptions {
    constructor(metadata, mainDir) {
        this._metadata = metadata;
        this._mainDir = mainDir;
        this._gsettings = this._getSettings();
        this._connectionIds = [];
    }

    /**
     * A helper function to get the Gio.Settings object for the extension
     * @param {String} schema_name
     * @return {Gio.Settings} The settings corresponding to the input schema
     */
    _getSettings(schema=null) {
        schema = schema ? schema : this._metadata['settings-schema'];
        const schemaDir = this._mainDir.get_child('schemas');
        let schemaSource;
        if (schemaDir.query_exists(null)) {
            schemaSource = Gio.SettingsSchemaSource.new_from_directory(
                schemaDir.get_path(),
                Gio.SettingsSchemaSource.get_default(),
                false
            );
        } else {
            schemaSource = Gio.SettingsSchemaSource.get_default();
        }
    
        const schemaObj = schemaSource.lookup(schema, true);
        if (!schemaObj) {
            throw new Error(
                'Schema' + schema + ' could not be found for extension ' +
                this._metadata.uuid + '. Please check your installation.'
            );
        }
    
        const args = { settings_schema: schemaObj };
        // let path = schema.replace('.', '/');
        // if (path) {
        //     args.path = path;
        // }
    
        return new Gio.Settings(args);
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

    // Runnable entities of menu (script and scene domains)
    get enabledRunnables() {
        return this._gsettings.get_strv(HASS_ENABLED_RUNNABLES);
    }
    set enabledRunnables(entities) {
        this._gsettings.set_strv(HASS_ENABLED_RUNNABLES, entities);
    }

    // Panel extra sensors
    get enabledSensors() {
        return this._gsettings.get_strv(HASS_ENABLED_SENSOR_IDS);
    }
    set enabledSensors(entities) {
        this._gsettings.set_strv(HASS_ENABLED_SENSOR_IDS, entities);
    }

    // abstraction layer for togglables, runnables and sensors 
    getEnabledByType(type) {
        if (type === "runnable") {
            return this.enabledRunnables; // calls the getter
        } else if (type === "togglable") {
            return this.enabledEntities; // calls the getter
        } else if (type === "sensor") {
            return this.enabledSensors; // calls the getter
        }
    }
    setEnabledByType(type, enabledEntities) {
        if (type === "runnable") {
            this.enabledRunnables = enabledEntities; // calls the setter
        } else if (type === "togglable") {
            this.enabledEntities = enabledEntities; // calls the setter
        } else if (type === "sensor") {
            this.enabledSensors = enabledEntities; // calls the setter
        }
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
