import Gio from 'gi://Gio';

export const PANEL_ICON_PATH = 'default-panel-icon';
export const VALID_PANEL_ICONS = 'valid-panel-icons';
export const HASS_URL = 'hass-url';
export const HASS_ENTITIES_CACHE = 'hass-entities-cache';
export const HASS_ENABLED_ENTITIES = 'hass-enabled-entities';
export const HASS_ENABLED_RUNNABLES = 'hass-enabled-runnables';
export const HASS_ENABLED_SENSOR_IDS = 'hass-enabled-sensor-ids';
export const SHOW_NOTIFICATIONS_KEY = 'show-notifications';
export const DO_REFRESH = 'sensors-refresh';
export const REFRESH_RATE = 'sensors-refresh-seconds';
export const SENSOR_SEPARATOR = 'hass-sensor-separator';
export const SENSOR_SPACING = 'hass-sensor-spacing';
export const DEBUG_MODE = 'debug-mode';

// Valid values of the SENSOR_SEPARATOR setting
export const VALID_SENSOR_SEPARATORS = ['none', 'space', 'dot', 'line'];

/**
 * Marker used inside the HASS_ENABLED_SENSOR_IDS list to store a separator placed by the user
 * between two sensors. It contains no dot, so it can never collide with an entity id.
 */
export const PANEL_SEPARATOR_ITEM = '__separator__';

/**
 * Drop the separators of a panel layout that do not separate anything (anymore): a leading or
 * trailing one, and consecutive ones.
 *
 * @param {Array} layout The panel layout to clean up
 * @return {Array} The cleaned up layout
 */
export function normalizeSensorLayout(layout) {
    let result = [];
    for (let item of layout) {
        if (item !== PANEL_SEPARATOR_ITEM) {
            result.push(item);
            continue;
        }
        if (result.length && result[result.length - 1] !== PANEL_SEPARATOR_ITEM)
            result.push(item);
    }
    if (result.length && result[result.length - 1] === PANEL_SEPARATOR_ITEM)
        result.pop();
    return result;
}

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
        this._gsettings = null;
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

    /**
     * The full panel layout: the enabled sensor ids in panel order, with PANEL_SEPARATOR_ITEM
     * markers at the positions where the user placed a separator.
     */
    get sensorLayout() {
        return this._gsettings.get_strv(HASS_ENABLED_SENSOR_IDS);
    }
    set sensorLayout(items) {
        this._gsettings.set_strv(HASS_ENABLED_SENSOR_IDS, items);
    }

    /**
     * The enabled sensor ids only, without the separators.
     */
    get enabledSensors() {
        return this.sensorLayout.filter(item => item !== PANEL_SEPARATOR_ITEM);
    }
    set enabledSensors(entities) {
        // Merge the new list of enabled sensors into the current layout, so that the separators
        // placed by the user keep their position. Sensors that are not in the layout yet are
        // appended at the end.
        let layout = [];
        let remaining = entities.slice();
        for (let item of this.sensorLayout) {
            if (item === PANEL_SEPARATOR_ITEM) {
                layout.push(item);
                continue;
            }
            let index = remaining.indexOf(item);
            if (index > -1) {
                layout.push(item);
                remaining.splice(index, 1);
            }
        }
        // Separators that no longer separate two sensors are dropped
        this.sensorLayout = normalizeSensorLayout(layout.concat(remaining));
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

    // Panel sensors layout
    get sensorSeparator() {
        let value = this._gsettings.get_string(SENSOR_SEPARATOR);
        return VALID_SENSOR_SEPARATORS.includes(value) ? value : 'none';
    }
    set sensorSeparator(value) {
        if (!VALID_SENSOR_SEPARATORS.includes(value))
            throw new Error(`Unsupported sensor separator: ${value}`);
        this._gsettings.set_string(SENSOR_SEPARATOR, value);
    }

    get sensorSpacing() {
        return this._gsettings.get_int(SENSOR_SPACING);
    }
    set sensorSpacing(value) {
        this._gsettings.set_int(SENSOR_SPACING, value);
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
