const {Soup, Gio, GLib, Secret} = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const MscOptions = Me.imports.settings.MscOptions;

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

const mscOptions = new MscOptions();
const MyUUID = Me.metadata.uuid;

let TOKEN_SCHEMA;

function getTokenSchema() {
    if (!TOKEN_SCHEMA) {
        TOKEN_SCHEMA = Secret.Schema.new("org.gnome.hass-data.Password",
            Secret.SchemaFlags.NONE,
            {
                "token_string": Secret.SchemaAttributeType.STRING,
            }
        );
    }
    return TOKEN_SCHEMA;
}

const VALID_TOGGLABLES = ['switch.', 'light.', 'fan.', 'input_boolean.'];

/**
 *
 * @param {String} type Request type.
 * @param {String} url Url of the request.
 * @param {Object} data Data in json format.
 * @return {Soup.Message} A soup message with the requested parameters.
 */
function _constructMessage(type, url, data=null) {
    // Initialize message and set the required headers
    // let message = Soup.Message.new_from_encoded_form(
    _log("constructing Message for %s", [url]);
    let message = Soup.Message.new(type, url);
    let token = Secret.password_lookup_sync(getTokenSchema(), {"token_string": "user_token"}, null);
    if (!token) {
      _log("Fail to retreive token from configuration, can't construct API message", null, false);
      return false;
    }
    message.request_headers.append('Authorization', `Bearer ${token}`);
    if (data !== null){
        // Set body data: Should be in json format, e.g. '{"entity_id": "switch.some_relay"}'
        // TODO: Maybe perform a check here
        let bytes2 = GLib.Bytes.new(JSON.stringify(data));
        message.set_request_body_from_bytes('application/json', bytes2);
    }
    message.request_headers.set_content_type("application/json", null);
    return message
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
    type = type ? type : 'GET';
    // Initialize session
    let session = Soup.Session.new();
    session.set_timeout(5);
    let message;
    try{
        message = _constructMessage(type, url, data);
    } catch (error) {
        logError(error, `${MyUUID}: Could not construct ${type} message for ${url}`);
        if (on_error) on_error();
        return;
    }
    if (!message) {
      _log("Fail to build message for %s request on %s", [type, url]);
      if (on_error) on_error();
      return;
    }
    try {
        _log("sending %s request on %s...", [type, url]);
        let result = session.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            null,
            (session, result) => {
                _log("handling result of %s request on %s...", [type, url]);
                if (message.get_status() == Soup.Status.OK) {
                    result = session.send_and_read_finish(result);
                    if (!callback) {
                        _log("%s request on %s: success", [type, url]);
                        return;
                    }
                    try {
                        _log("decoding result of %s request on %s...", [type, url]);
                        let decoder = new TextDecoder('utf-8');
                        let response = decoder.decode(result.get_data());
                        _log("run callback for %s request on %s", [type, url]);
                        callback(JSON.parse(response));
                    } catch (error) {
                        logError(error, `${MyUUID}: fail to decode result of request on ${url}.`);
                        if (on_error) on_error();
                    }
                }
                else {
                    _log(
                        "invalid return of request on %s (status: %s)",
                        [url, message.get_status()], false
                    );
                    if (on_error) on_error();
                }
            }
        );
    } catch (error) {
        logError(error, `${MyUUID}: error durring request on ${url}: ${error}`);
        if (on_error) on_error();
    }
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
 * Get entities
 *
 * @param {Function} callback The callback to run with the result
 * @param {Function} on_error The callback to run on error
 * @param {Boolean} force_reload Force reloading cache (optional, default: false)
 *
 */
function getEntities(callback=null, on_error=null, force_reload=false) {
    let entities = mscOptions.entitiesCache;
    if (entities.length == 0 || force_reload) {
        _log("get entities from API");
        send_async_request(
            this.computeURL('api/states'), 'GET', null,
            function (response) {
                if (Array.isArray(response)) {
                    let entities = [];
                    for (let ent of response) {
                        entities.push(
                          {
                            'entity_id': ent.entity_id,
                            'name': ent.attributes.friendly_name,
                            'attributes': ent.attributes,
                            'state': ent.state,
                          }
                        )
                    }
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
 * Invalidate entities cache
 */
function invalidateEntitiesCache() {
    _log("invalidate entities cache");
    mscOptions.entitiesCache = [];
}

/**
 * Get togglables
 *
 * @param {Function} callback The callback to run with the result
 * @param {Function} on_error The callback to run on error
 * @param {Boolean} only_enabled Filter on enabled togglables (optional, default: false)
 * @param {Boolean} force_reload Force reloading cache (optional, default: false)
 *
 */
function getTogglables(callback, on_error=null, only_enabled=false, force_reload=false) {
    getEntities(
        function(entities) {
            let togglables = [];
            for (let ent of entities) {
                if (only_enabled && !mscOptions.enabledEntities.includes(ent.entity_id))
                    continue;
                // Filter on togglable
                if (VALID_TOGGLABLES.filter(tog => ent.entity_id.startsWith(tog)).length == 0)
                    continue;
                togglables.push({'entity_id': ent.entity_id, 'name': ent.name});
            }
            _log("%s %stogglable entities found", [togglables.length, only_enabled?'enabled ':'']);
            callback(togglables);
        },
        on_error,
        force_reload
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
function getSensors(callback, on_error=null, only_enabled=false, force_reload=false) {
    getEntities(
        function(entities) {
            let sensors = [];
            for (let ent of entities) {
                if (only_enabled && !mscOptions.enabledSensors.includes(ent.entity_id))
                    continue;
                if (!ent.entity_id.startsWith('sensor.')) continue;
                if (!ent.state || !ent.attributes.unit_of_measurement) continue;
                if (ent.state === "unknown" || ent.state === "unavailable") continue;
                sensors.push(
                  {
                    'entity_id': ent.entity_id,
                    'name': ent.name,
                    'unit': ent.attributes.unit_of_measurement,
                    'state': ent.state,
                  }
                )
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
function getSensor(sensor_id, callback, on_not_found=null, force_reload=false) {
    getSensors(
        function(sensors) {
            for (let sensor of sensors) {
                if (sensor.entity_id == sensor_id) {
                    callback(sensor);
                    return;
                }
            }
            if (on_not_found) on_not_found();
        },
        on_not_found,
        false,
        force_reload
    );
}

/**
 * Compute sensor state as display by the extension
 * @param {String} sensor  The sensor object
 * @return {String} The computed sensor state
 */
function computeSensorState(sensor) {
    return `${sensor.state} ${sensor.unit}`;
}

/**
 * Toggle an entity in Home-Assistant
 * @param {String} entityId  The entity ID
 */
function toggleEntity(entity) {
    let data = { "entity_id": entity.entity_id };
    let domain = entity.entity_id.split(".")[0];  // e.g. light.mylight => light
    send_async_request(
        computeURL(`api/services/${domain}/toggle`),
        'POST',
        data,
        function(response) {
            if (!response.length) {
              notify(
                  _('Error toggling %s').format(entity.name),
                  _('Error occured trying to toggle %s: entity not found.').format(entity.name),
              )
            }
            else if (response[0].state == 'on')
              notify(
                  _('%s toggled on').format(entity.name),
                  _('%s successfully toggled on.').format(entity.name)
              );
            else if (response[0].state == 'off')
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
 * Trigger Home-Assistant event by name
 * @param {String} eventName  The HA event name (start/stop/restart)
 */
function triggerHassEvent(eventName, callback=null, on_error=null) {
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
function arraysEqual(a, b) {
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

/**
 *
 * @param {String} schema_name
 * @return {Gio.Settings} The settings corresponding to the input schema
 */
function getSettings(schema=null) {
    schema = schema ? schema : Me.metadata['settings-schema'];
    const schemaDir = Me.dir.get_child('schemas');
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
            Me.metadata.uuid + '. Please check your installation.'
        );
    }

    const args = { settings_schema: schemaObj };
    // let path = schema.replace('.', '/');
    // if (path) {
    //     args.path = path;
    // }

    return new Gio.Settings(args);
}

const getMethods = (obj) => {
  let properties = new Set()
  let currentObj = obj
  do {
    Object.getOwnPropertyNames(currentObj).map(item => properties.add(item))
  } while ((currentObj = Object.getPrototypeOf(currentObj)))
  return [...properties.keys()].filter(item => typeof obj[item] === 'function')
}

function getTogglableEntityIcon(entity) {
    let icon_path = Me.dir.get_path();
    if (entity.entity_id.startsWith('light.'))
        icon_path += '/icons/ceiling-light.svg';
    else if (entity.entity_id.startsWith('fan.'))
        icon_path += '/icons/fan.svg';
    else
        icon_path += '/icons/toggle-switch-outline.svg';
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
function _log(msg, args=null, debug=true) {
    if (debug && !mscOptions.debugMode) return;
    if (args) msg = msg.format.apply(msg, args);
    log(`${MyUUID}: ${msg}`);
}

function notify(msg, details) {
    if (!mscOptions.showNotifications) return;
    let Main = imports.ui.main;
    let MessageTray = imports.ui.messageTray;
    let source = new MessageTray.Source(Me.metadata.name);
    Main.messageTray.add(source);
    let notification = new MessageTray.Notification(
        source, msg, details,
        {gicon: Gio.icon_new_for_string(Me.dir.get_path() + '/icons/hass-symbolic.svg')}
    );
    notification.setTransient(true);
    source.showNotification(notification);
}
