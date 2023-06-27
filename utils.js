const {Soup, Gio, GLib, Secret} = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();

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
    log(`hass-gshell: Constructing Message for ${url}`);
    let message = Soup.Message.new(type, url);
    message.request_headers.append(
      'Authorization',
      `Bearer ${Secret.password_lookup_sync(getTokenSchema(), {"token_string": "user_token"}, null)}`
    )
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
 * @param {String} url The url which you want to 'ping'
 * @param {String} type Request type (e.g. 'GET', 'POST')
 * @param {Object} data (optional) Data that you want to send with the request (must be in json format)
 * @return {Object} The response of the request (returns false if the request was unsuccessful)
 */
function send_request(url, type='GET', data=null) {
    // Initialize session
    let session = Soup.Session.new();
    let message;
    try{
        message = _constructMessage(type, url, data);
    } catch (error) {
        logError(error, `hass-gshell: Could not construct ${type} message for ${url}`);
        return false
    }
    let result = session.send_and_read(
        message,
        null
    );
    if (message.get_status() == Soup.Status.OK) {
        try {
            let decoder = new TextDecoder('utf-8');
            let response = decoder.decode(result.get_data());
            return JSON.parse(response)
        } catch (error) {
            logError(error, `Could not send request to ${url}.`);
        }
    }
    return false
}

/**
 *
 * @param {String} base_url The base url of the Home Assistant instance
 * @return {Object} Array of dictionaries with 'entity_id' and 'name' entries
 */
function discoverSwitches(base_url) {
    if ( !base_url || base_url === "http:///" || base_url === "https:///" ) {
        return [];
    }
    let url = `${base_url}api/states`
    let data = send_request(url, 'GET');
    if (data === false) {
        return [];
    }
    let entities = [];
    for (let ent of data) {
        // Save all the switchable/togglable entities in the entities array
        if (VALID_TOGGLABLES.filter(tog => ent.entity_id.startsWith(tog)).length > 0) {
        // if (ent.entity_id.startsWith('switch.') || ent.entity_id.startsWith('light.')) {
            entities.push(
              {
                'entity_id': ent.entity_id,
                'name': ent.attributes.friendly_name
              }
            )
        }
    }
    return entities.sort((a,b) => (a.name > b.name) ? 1 : ((b.name > a.name) ? -1 : 0));
}

/**
 *
 * @param {String} base_url The base url of the Home Assistant instance
 * @return {Object} Array of dictionaries with 'entity_id' and 'name' entries
 */
function discoverSensors(base_url) {
    let url = `${base_url}api/states`
    let data = send_request(url, 'GET');
    if (data === false) {
        return [];
    }
    let entities = [];
    for (let ent of data) {
        // Save all the switchable/togglable entities in the entities array
        if (ent.entity_id.startsWith('sensor.')) {
            if (!ent.state || !ent.attributes.unit_of_measurement){
                continue
            }
            if (ent.state === "unknown" || ent.state === "unavailable"){
                continue
            }
            entities.push(
              {
                'entity_id': ent.entity_id,
                'name': ent.attributes.friendly_name,
                'unit': ent.attributes.unit_of_measurement
              }
            )
        }
    }
    return entities.sort((a,b) => (a.name > b.name) ? 1 : ((b.name > a.name) ? -1 : 0));
}

/**
 * Check equality of elements of two arrays
 * @param {Array} a Array 1
 * @param {Array} b Array 2
 * @return {boolean} true if the two arrays have the same elements. false otherwise.
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
