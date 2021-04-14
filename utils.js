// For the GET Requests
const {Soup, Gio, GLib, Secret} = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();
// new sesssion
var soupSyncSession = new Soup.SessionSync();

const TOKEN_SCHEMA = Secret.Schema.new("org.gnome.hass-data.Password",
	Secret.SchemaFlags.NONE,
	{
		"token_string": Secret.SchemaAttributeType.STRING,
	}
);

function setNewState(url) {
    let message = Soup.Message.new(type, url);
    let responseCode = soupSyncSession.send_message(message);

    if(responseCode == 200) {
        try {
            return JSON.parse(message['response-body'].data);
        } catch(error) {
            log("ERROR OCCURRED WHILE SENDING GET REQUEST TO " + url + ". ERROR WAS: " + error);
            return false;
        }
    }
    return -1;
}

function getSettings(schema_name) {
  if (schema_name !== undefined) {
    schema_name = `org.gnome.shell.extensions.${schema_name}`;
  } else {
    schema_name = Me.metadata['settings-schema'];
  }
  let GioSSS = Gio.SettingsSchemaSource;
  let schemaSource = GioSSS.new_from_directory(
    Me.dir.get_child("schemas").get_path(),
    GioSSS.get_default(),
    false
  );
  let schemaObj = schemaSource.lookup(schema_name, true);
  if (!schemaObj) {
    throw new Error('Schema ' + schema + ' could not be found for extension ' + Me.metadata.uuid + '. Please check your installation.');
  }
  return new Gio.Settings({ settings_schema : schemaObj });
}

// Credits: https://stackoverflow.com/questions/65830466/gnome-shell-extension-send-request-with-authorization-bearer-headers/65841700
function send_request(url, type='GET', data=null) {
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
  let responseCode = soupSyncSession.send_message(message);
  
  if(responseCode == 200) {
      try {
          return JSON.parse(message['response-body'].data);
      } catch(error) {
          logError(error, `Could not send request to ${url}.`);
      }
  }
  return false;
}