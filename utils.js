const {Soup, Gio, GLib, Secret} = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();

const TOKEN_SCHEMA = Secret.Schema.new("org.gnome.hass-data.Password",
	Secret.SchemaFlags.NONE,
	{
		"token_string": Secret.SchemaAttributeType.STRING,
	}
);

/**
 * 
 * @param {String} type Request type.
 * @param {String} url Url of the request.
 * @param {Object} data Data in json format.
 * @return {Soup.Message} A soup message with the requested parameters.
 */
function _constructMessage(type, url, data=null) {
    // Initialize message and set the required headers
    let message = Soup.Message.new(type, url);
    message.request_headers.append(
      'Authorization',
      `Bearer ${Secret.password_lookup_sync(TOKEN_SCHEMA, {"token_string": "user_token"}, null)}`
    )
    if (data !== null){
        // Set body data: Should be in json format, e.g. '{"entity_id": "switch.some_relay"}'
        // TODO: Maybe perform a check here
        message.set_request('application/json', 2, data);
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
    session.set_property(Soup.SESSION_TIMEOUT, 3);
    session.set_property(Soup.SESSION_USER_AGENT, "hass-gshell");

    // Initialize message and set the required headers
    let message = _constructMessage(type, url, data);
    let responseCode = session.send_message(message);
    if (responseCode == Soup.Status.OK) {
        try {
            return JSON.parse(message['response-body'].data);
        } catch(error) {
            logError(error, `Could not send request to ${url}.`);
        }
    }
    return false;
}

/**
 * 
 * @param {String} base_url The base url of the Home Assistant instance
 * @return {Object} Array of dictionaries with 'entity_id' and 'name' entries
 */
function discoverSwitches(base_url) {
    let url = `${base_url}api/states`
    let data = send_request(url, 'GET');
    if (data === false) {
        return [];
    }
    let entities = [];
    for (let ent of data) {
        // Save all the switchable/togglable entities in the entities array
        if (ent.entity_id.startsWith('switch.') || ent.entity_id.startsWith('light.')) {
            entities.push(
              {
                'entity_id': ent.entity_id,
                'name': ent.attributes.friendly_name
              }
            )
        }
    }
    return entities
}

/**
 * 
 * @param {String} schema_name 
 * @return {Gio.Settings} The settings corresponding to the input schema
 */
// function getSettings(schema_name) {
//     if (schema_name !== undefined) {
//         schema_name = `org.gnome.shell.extensions.${schema_name}`;
//     } else {
//         schema_name = Me.metadata['settings-schema'];
//     }
//     let GioSSS = Gio.SettingsSchemaSource;
//     let schemaSource = GioSSS.new_from_directory(
//       Me.dir.get_child("schemas").get_path(),
//       GioSSS.get_default(),
//       false
//     );
//     let schemaObj = schemaSource.lookup(schema_name, true);
//     if (!schemaObj) {
//         throw new Error('Schema ' + schema_name + ' could not be found for extension ' + Me.metadata.uuid + '. Please check your installation.');
//     }
//     return new Gio.Settings({ settings_schema : schemaObj });
// }

function getSettings(schema) {
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

// // Credits: https://stackoverflow.com/questions/65830466/gnome-shell-extension-send-request-with-authorization-bearer-headers/65841700
// function send_request(url, type='GET', data=null) {
//   let message = Soup.Message.new(type, url);
//   message.request_headers.append(
//     'Authorization',
//     `Bearer ${Secret.password_lookup_sync(TOKEN_SCHEMA, {"token_string": "user_token"}, null)}`
//   )
//   if (data !== null){
//     // Set body data: Should be in json format, e.g. '{"entity_id": "switch.some_relay"}'
//     // TODO: Maybe perform a check here
//     message.set_request('application/json', 2, data);
//   }
//   message.request_headers.set_content_type("application/json", null);
//   let output = false;
//   var soupSession = new Soup.Session();
//   soupSession.queue_message(message, (sess, msg) => {
//     if (msg.status_code == 200) {
//       try {
//         output = JSON.parse(msg['response-body'].data);
//       } catch(error) {
//         logError(error, "Could not send GET request to " + url);
//       }
//     }
//   });
//   return output;
// }

const getMethods = (obj) => {
  let properties = new Set()
  let currentObj = obj
  do {
    Object.getOwnPropertyNames(currentObj).map(item => properties.add(item))
  } while ((currentObj = Object.getPrototypeOf(currentObj)))
  return [...properties.keys()].filter(item => typeof obj[item] === 'function')
}
