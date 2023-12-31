import Soup from 'gi://Soup';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Secret from 'gi://Secret';

import * as Settings from './settings.js';

let MyUUID = null;  // "hass-gshell@geoph9-on-github";

let mscOptions = null;
let _settings = null;
let _metadata = null;
let _mainDir = null;
let _ = null;

let TOKEN_SCHEMA;

export function init(uuid, settings, metadata, mainDir, gettext_func) {
    if (MyUUID === null) MyUUID = uuid;
    if (_settings === null) _settings = settings;
    if (_metadata === null) _metadata = metadata;
    if (_mainDir === null) _mainDir = mainDir;
    if (_ === null) _ = gettext_func;
    if (mscOptions === null)  mscOptions = new Settings.MscOptions(_metadata, _mainDir);
}

export function disable() {
	if (mscOptions !== null)  {
		mscOptions.destroy();
		mscOptions = null;
	}
	if (_settings !== null) _settings = null;
    if (MyUUID !== null) MyUUID = null;
}

export function getTokenSchema() {
    if (!TOKEN_SCHEMA) {
        TOKEN_SCHEMA = Secret.Schema.new(
            "org.gnome.hass-data.Password",
            /** DONT_MATCH_NAME is used as a workaround for a bug in gnome-keyring
             *  which prevents cold keyrings from being searched (and hence does not prompt for unlocking)
             *  see https://gitlab.gnome.org/GNOME/gnome-keyring/-/issues/89 and
             *  https://gitlab.gnome.org/GNOME/libsecret/-/issues/7 for more information
             */
            Secret.SchemaFlags.DONT_MATCH_NAME,
            {
                "token_string": Secret.SchemaAttributeType.STRING,
            }
        );
    }
    return TOKEN_SCHEMA;
}

const VALID_TOGGLABLES = ['switch.', 'light.', 'fan.', 'input_boolean.'];
const VALID_RUNNABLES = ['scene.', 'script.'];

/**
 *
 * @param {String} type Request type.
 * @param {String} url Url of the request.
 * @param {Object} data Data of the request (null if no data)
 * @param {Function} callback The callback to run with resulting message
 * @param {Function} on_error The callback to run on error (optional)
 * @return {Soup.Message} A soup message with the requested parameters.
 */
function forge_async_message(type, url, data, callback, on_error=null) {
    // Encode data to JSON (if provided)
    if (data != null) data = JSON.stringify(data);
    _log(
        "Forge a %s message for %s (%s): firstly retrieve the API Long-Live Token...",
        [type, url, data?"with data=%s".format(data):"without data"]
    );
    Secret.password_lookup(
        getTokenSchema(),
        {"token_string": "user_token"},
        null,
        (source, result) => {
            let token = Secret.password_lookup_finish(result);
            if (!token) {
                _log(
                    "Fail to retreive API Long-Live Token from configuration, "
                    + "can't construct API message", null, false
                );
                if (on_error) on_error();
                return;
            }
            _log("API Long-Live Token retreived, forge message...");
            // Initialize message and set the required headers
            let message = Soup.Message.new(type, url);
            message.request_headers.append('Authorization', `Bearer ${token}`);
            message.request_headers.set_content_type("application/json", null);
            if (data !== null){
                let bytes2 = GLib.Bytes.new(data);
                message.set_request_body_from_bytes('application/json', bytes2);
            }
            callback(message);
        }
    );
}

/**
 *
 * @param {String} url The url which you want to request
 * @param {String} type Request type (e.g. 'GET', 'POST', default: GET)
 * @param {Object} data Data that you want to send with the request (optional, must be in json format, default: null)
 * @param {Function} callback The callback for request result (optional)
 * @param {Function} on_error The callback to run on request error (optional)
 * @return {Object} The response of the request (returns false if the request was unsuccessful)
 */
function send_async_request(url, type, data, callback=null, on_error=null) {
    forge_async_message(
        type ? type : 'GET',
        url,
        data,
        (message) => {
            // Initialize session
            let session = Soup.Session.new();
            session.set_timeout(5);

            try {
                _log("Sending %s request on %s...", [type, url]);
                let result = session.send_and_read_async(
                    message,
                    GLib.PRIORITY_DEFAULT,
                    null,
                    (session, result) => {
                        _log(
                            "Handling result of %s request on %s (status: %s)...",
                            [type, url, Soup.Status.get_phrase(message.get_status())]
                        );
                        if (message.get_status() == Soup.Status.OK) {
                            result = session.send_and_read_finish(result);
                            if (!callback) {
                                _log("%s request on %s: success", [type, url]);
                                return;
                            }
                            try {
                                _log("Decoding result of %s request on %s...", [type, url]);
                                let decoder = new TextDecoder('utf-8');
                                let response = decoder.decode(result.get_data());
                                _log(
                                    "Result of %s request on %s (%s): %s", [
                                    type,
                                    url,
                                    data?"with data=%s".format(JSON.stringify(data)):"without data",
                                    response
                                ]);
                                _log("Run callback for %s request on %s", [type, url]);
                                callback(JSON.parse(response));
                            } catch (error) {
                                logError(error, `${MyUUID}: fail to decode result of request on ${url}.`);
                                if (on_error) on_error();
                            }
                        }
                        else {
                            _log(
                                "Invalid return of request on %s (status: %s)",
                                [url, Soup.Status.get_phrase(message.get_status())], false
                            );
                            if (on_error) on_error();
                        }
                    }
                );
            } catch (error) {
                logError(error, `${MyUUID}: error durring request on ${url}: ${error}`);
                if (on_error) on_error();
            }
        },
        () => {
            _log("Fail to build message for %s request on %s", [type, url]);
            if (on_error) on_error();
            return;
        }
    );
}


// Compute HASS URL
function computeURL(path, hass_url=null) {
    let url = hass_url ? hass_url : mscOptions.hassUrl;
    if (!RegExp('^https?://').exec(url))
        url = `http://${url}` // use http:// by default
    if (!path)
        return url
    if (!url.endsWith("/")) url += "/";  //  needs a trailing slash
    return url + path
}

/**
 * Map an entity object
 *
 * @param {Object} entity The raw entity state object, as return by HASS API
 * @returns {Object}
 */
function mapEntity(ent) {
    return {
      'entity_id': ent.entity_id,
      'name': ent.attributes.friendly_name,
      'attributes': ent.attributes,
      'state': ent.state,
    }
}

/**
 * Get entities
 *
 * @param {Function} callback The callback to run with the result
 * @param {Function} on_error The callback to run on error
 * @param {Boolean} force_reload Force reloading cache (optional, default: false)
 *
 */
export function getEntities(callback=null, on_error=null, force_reload=false) {
    let entities = mscOptions.entitiesCache;
    if (entities.length == 0 || force_reload) {
        _log("get entities from API");
        send_async_request(
            computeURL('api/states'), 'GET', null,
            function (response) {
                if (Array.isArray(response)) {
                    let entities = response.map(mapEntity);
                    _log("%s entities retreived, sort it by name", [entities.length]);
                    entities = entities.sort((a,b) => (a.name > b.name) ? 1 : ((b.name > a.name) ? -1 : 0));
                    _log("update entities cache");
                    mscOptions.entitiesCache = entities;
                    if (callback)
                        callback(entities);
                }
                else if (on_error) {
                    on_error();
                }
            }.bind(this),
            on_error
        );
    }
    else {
        _log("get entities from cache");
        if (callback) callback(entities);
    }
}

/**
 * Get one entity
 *
 * @param {String} entity_id The requested entity ID
 * @param {Function} callback The callback to run with the result
 * @param {Function} on_error The callback to run on error
 * @param {Boolean} force_reload Force reloading cache (optional, default: false)
 *
 */
function getEntity(entity_id, callback=null, on_error=null, force_reload=false) {
    let entity = mscOptions.entitiesCache.filter(ent => ent.entity_id == entity_id);
    if (entity.length == 0 || force_reload) {
        _log("get entity %s from API", [entity_id]);
        send_async_request(
            computeURL(`api/states/${entity_id}`), 'GET', null,
            function (response) {
                if (typeof response === "object") {
                    if (callback)
                        callback(mapEntity(response));
                }
                else if (on_error) {
                    on_error();
                }
            }.bind(this),
            on_error
        );
    }
    else {
        _log("get entity %s from cache", [entity_id]);
        if (callback) callback(entity[0]);
    }
}

/**
 * Invalidate entities cache
 */
export function invalidateEntitiesCache() {
    _log("invalidate entities cache");
    mscOptions.entitiesCache = [];
}

/**
 * Get entities by type
 *
 * @param {string} type The type of the entities to get ("runnable", "togglable", or "sensor") // TODO sensors! 
 * @param {Function} callback The callback to run with the result
 * @param {Function} on_error The callback to run on error
 * @param {Boolean} only_enabled Filter on enabled runnables (optional, default: false)
 * @param {Boolean} force_reload Force reloading cache (optional, default: false)
 */
export function getEntitiesByType(type, callback, on_error=null, only_enabled=false, force_reload=false) {
    getEntities(
        function(entities) {
            let results = [];
            for (let ent of entities) {
                if (only_enabled && !mscOptions.getEnabledByType(type).includes(ent.entity_id))
                    continue;

                if (type === "sensor") {
                    if (!isSensor(ent)) 
                        continue;
                    results.push(mapSensor(ent));
                } else {
                    let validDomains;
                    if (type === "togglable") validDomains = VALID_TOGGLABLES;
                    else if (type === "runnable") validDomains = VALID_RUNNABLES;
    
                    if (validDomains.filter(domain => ent.entity_id.startsWith(domain)).length == 0)
                        continue;
                    
                    results.push({'entity_id': ent.entity_id, 'name': ent.name});
                }

            }
            _log("%s entities found", [results.length]);
            callback(results);
        },
        on_error,
        force_reload
    );
}

/**
 * Map a sensor entity object
 *
 * @param {Object} entity The raw entity object, as returned by getEntity()/getEntities()
 * @return {Object}
 */
function mapSensor(entity) {
    return {
      'entity_id': entity.entity_id,
      'name': entity.name,
      'unit': entity.attributes.unit_of_measurement,
      'state': entity.state,
    }
}

/**
 * Check it's a sensor
 *
 * @param {Object} entity The entity object
 * @return {Boolean}
 */
function isSensor(entity) {
    return (
        entity.entity_id.startsWith('sensor.')
        && entity.state
        && entity.attributes.unit_of_measurement
        && entity.state !== "unknown"
        && entity.state !== "unavailable"
    );
}

/**
 * Get sensors
 *
 * @param {Function} callback The callback to run with the result
 * @param {Function} on_error The callback to run on error
 * @param {Boolean} only_enabled Filter on enabled togglables (optional, default: false)
 * @param {Boolean} force_reload Force reloading cache (optional, default: false)
 *
 */
export function getSensors(callback, on_error=null, only_enabled=false, force_reload=false) {
    getEntities(
        function(entities) {
            let sensors = [];
            for (let ent of entities) {
                if (only_enabled && !mscOptions.enabledSensors.includes(ent.entity_id))
                    continue;
                if (!isSensor(ent))
                    continue;
                sensors.push(mapSensor(ent));
            }
            _log("%s %ssensor entities found", [sensors.length, only_enabled?'enabled ':'']);
            callback(sensors);
        },
        on_error,
        force_reload
    );
}

/**
 * Get a sensor by its id
 *
 * @param {String} sensor_id The expected sensor ID
 * @param {Function} callback The callback to run with the result
 * @param {Function} on_not_found The callback to run if sensor is not found (or on error)
 * @param {Boolean} force_reload Force reloading cache (optional, default: false)
 *
 */
export function getSensor(sensor_id, callback, on_not_found=null, force_reload=false) {
    getEntity(
        sensor_id,
        function(entity) {
            if (isSensor(entity)) {
                callback(mapSensor(entity));
                return;
            }
            _log('getSensor(%s): is not a sensor (%s)', [sensor_id, JSON.stringify(entity)]);
            if (on_not_found) on_not_found();
        },
        on_not_found,
        force_reload
    );
}

/**
 * Toggle an entity in Home-Assistant
 * @param {String} entityId  The entity ID
 */
export function toggleEntity(entity) {
    let data = { "entity_id": entity.entity_id };
    let domain = entity.entity_id.split(".")[0];  // e.g. light.mylight => light
    send_async_request(
        computeURL(`api/services/${domain}/toggle`),
        'POST',
        data,
        function(response) {
            _log(
                'HA result toggling %s (%s): %s',
                [entity.name, entity.entity_id, JSON.stringify(response)]
            );

            // HA do not return new entity state in each case and not only the one we requested
            let state = null;
            for (let ent of response) {
                if (ent.entity_id == entity.entity_id) {
                    state = ent.state;
                    break;
                }
            }

            if (state == 'on')
              notify(
                  _('%s toggled on').format(entity.name),
                  _('%s successfully toggled on.').format(entity.name)
              );
            else if (state == 'off')
              notify(
                  _('%s toggled off').format(entity.name),
                  _('%s successfully toggled off.').format(entity.name)
              );
            else
              notify(
                  _('%s toggled').format(entity.name),
                  _('%s successfully toggled.').format(entity.name)
              );
        },
        function() {
            notify(
                _('Error toggling %s').format(entity.name),
                _('Error occured trying to toggle %s.').format(entity.name),
            )
        }
    );
}

/**
 * Turns an entity on in Home-Assistant
 * @param {String} entityId  The entity ID
 */
export function turnOnEntity(entity) {
    let data = { "entity_id": entity.entity_id };
    let domain = entity.entity_id.split(".")[0];  // e.g. script.run_me => script
    send_async_request(
        computeURL(`api/services/${domain}/turn_on`),
        'POST',
        data,
        function(response) {
            _log(
                'HA result turning on %s (%s): %s',
                [entity.name, entity.entity_id, JSON.stringify(response)]
            );

            // HA does respond with a timestamp as a new scenes/scripts state,
            // so there is no use in computing the response here 
        },
        function() {
            notify(
                _('Error turning on %s').format(entity.name),
                _('Error occured trying to turn on %s.').format(entity.name),
            )
        }
    );
}

/**
 * Trigger Home-Assistant event by name
 * @param {String} eventName  The HA event name (start/stop/restart)
 */
export function triggerHassEvent(eventName, callback=null, on_error=null) {
    send_async_request(
        computeURL(`api/events/homeassistant_${eventName}`),
        'POST',
        null,
        function() {
            if (eventName == 'start')
                notify(
                    _('Home-Assistant start event triggered'),
                    _('Home-Assistant start event successfully triggered.')
                );
            else if (eventName == 'stop')
                notify(
                    _('Home-Assistant stop event triggered'),
                    _('Home-Assistant stop event successfully triggered.')
                );
            else if (eventName == 'close')
                notify(
                    _('Home-Assistant close event triggered'),
                    _('Home-Assistant close event successfully triggered.')
                );
            else
                notify(
                    _('Home-Assistant event triggered'),
                    _('Home-Assistant event successfully triggered.')
                );
        },
        function() {
            if (eventName == 'start')
                notify(
                    _('Error triggering Home-Assistant start event'),
                    _('Error occured triggering Home-Assistant start event.'),
                );
            else if (eventName == 'stop')
                notify(
                    _('Error triggering Home-Assistant stop event'),
                    _('Error occured triggering Home-Assistant stop event.'),
                );
            else if (eventName == 'close')
                notify(
                    _('Error triggering Home-Assistant close event'),
                    _('Error occured triggering Home-Assistant close event.'),
                );
            else
                notify(
                    _('Error triggering Home-Assistant event'),
                    _('Error occured triggering Home-Assistant event.'),
                );

        }
    );
}

/**
 * Check equality of elements of two arrays
 * @param {Array} a Array 1
 * @param {Array} b Array 2
 * @return {Boolean} true if the two arrays have the same elements. false otherwise.
 */
export function arraysEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (a.length !== b.length) return false;

    // If you don't care about the order of the elements inside
    // the array, you should sort both arrays here.
    // Please note that calling sort on an array will modify that array.
    // you might want to clone your array first.

    for (var i = 0; i < a.length; ++i) {
      if (a[i] !== b[i]) return false;
    }
    return true;
}


// const getMethods = (obj) => {
//   let properties = new Set()
//   let currentObj = obj
//   do {
//     Object.getOwnPropertyNames(currentObj).map(item => properties.add(item))
//   } while ((currentObj = Object.getPrototypeOf(currentObj)))
//   return [...properties.keys()].filter(item => typeof obj[item] === 'function')
// }

export function getEntityIcon(domain) {
    let icon_path = _mainDir.get_path();
    switch (domain) {
        case "scene":
            icon_path += '/icons/palette.svg';
            break;
        case "script":
            icon_path += '/icons/script-text.svg';
            break;
        case "light":
            icon_path += '/icons/ceiling-light.svg';
            break;
        case "fan":
            icon_path += '/icons/fan.svg';
            break;
        case "switch":
        case "input_boolean":
            icon_path += '/icons/toggle-switch-outline.svg';
            break;
        default:
            // no need for a default as these are all the supported domains by the plugin, but log anyways
            _log(`Received unexpected domain in getEntityIcon: ${domain}`)
    }
    return Gio.icon_new_for_string(icon_path);
}

/**
 * Log a message
 * @param       {String}  msg            The message
 * @param       {[Mixed]} [args=null]    If array provided, it will be used to format the mesage
 *                                       using it format() method (optional, default: null)
 * @param       {Boolean} [debug=true]   If true, consider message as debugging one and logged it
 *                                       only if the debug mode is enabled (optional, default: true)
 */
export function _log(msg, args=null, debug=true) {
    if (debug && !mscOptions.debugMode) return;
    if (args) msg = msg.format.apply(msg, args);
    log(`${MyUUID}: ${msg}`);
}

export function notify(msg, details) {
    if (!mscOptions.showNotifications) return;
    let Main = imports.ui.main;
    let MessageTray = imports.ui.messageTray;
    let source = new MessageTray.Source(_metadata.name);
    Main.messageTray.add(source);
    let notification = new MessageTray.Notification(
        source, msg, details,
        {gicon: Gio.icon_new_for_string(_mainDir.get_path() + '/icons/hass-symbolic.svg')}
    );
    notification.setTransient(true);
    source.showNotification(notification);
}

/**
 * Connect specified settings changes to provided callback
 * @param {Array}   settings   List of settings
 * @param {Function} callback   The callback to run on change
 * @param {Array}    [args=[]]  Optional arguments to pass to callback
 */
export function connectSettings(settings, callback, args=[]) {
    let connectedSettingIds = [];
    for (let setting of settings) {
        connectedSettingIds.push(
            _settings.connect(
                "changed::" + setting,
                () => callback.apply(this, args)
            )
        );
    }
    return connectedSettingIds;
}

/**
 * Disconnect connected settings by ID
 * @param {Array} connectedSettingIds List of connected setting IDs
 */
export function disconnectSettings(connectedSettingIds) {
    connectedSettingIds.forEach(id => _settings.disconnect(id));
}
