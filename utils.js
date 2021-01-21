// For the GET Requests
const Soup = imports.gi.Soup;
// new sesssion
var soupSyncSession = new Soup.SessionSync();

function setNewState(url) {
	let message = Soup.Message.new(
        type, url
    );
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
