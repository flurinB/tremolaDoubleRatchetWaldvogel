// tremola.js

"use strict";

// The primary object that gets serialized and stored. Contains contacts dictionary, among other things
let tremola;
// Variable to keep track which chat we are in.
let curr_chat;
// This object contains the QR code that was last generated.
let qr;
// Contains the user's SSB ID.
let myId;
// List of peers in a local network.<br>
// if (status === 'online') localPeers[p][0] = true<br>
// if (status === 'offline') localPeers[p][0] = false<br>
// if (status === 'connected') localPeers[p][1] = true<br>
// if (status === 'disconnected') localPeers[p][1] = false <br>
// feedID ~ [isOnline, isConnected] - TF, TT, FT - FF means to remove this entry
let localPeers = {};
// Variable whether the UI has to be redrawn or not.
let must_redraw = false;
// This variable keeps track what the edit_overlay was used for.
let edit_target = '';
// The ID of the current contact being viewed or generated.
let new_contact_id = '';
// An array of nice colors.
const colors = ["#d9ceb2", "#99b2b7", "#e6cba5", "#ede3b4", "#8b9e9b", "#bd7578", "#edc951",
    "#ffd573", "#c2a34f", "#fbb829", "#ffab03", "#7ab317", "#a0c55f", "#8ca315",
    "#5191c1", "#6493a7", "#bddb88"]
// The list of known pubs. Unused.
let pubs = []

// --- menu callbacks

/*
function menu_sync() {
  if (localPeers.length == 0)
    launch_snackbar("no local peer to sync with");
  else {
    for (var i in localPeers) {
      backend("sync " + i);
      launch_snackbar("sync launched");
      break
    }
  }
  closeOverlay();
}
*/
var timeThreshold;
var del_msg_bool;//before = false;
var unitNumberTuple = ["","",""];
/**
 * Sets up the members scenario after the plus button was pressed in the chats scenario.
 */
function menu_new_conversation() {
    fill_members()
    prev_scenario = 'chats'
    setScenario("members")
    document.getElementById("div:textarea").style.display = 'none';
    document.getElementById("div:confirm-members").style.display = 'flex';
    document.getElementById("tremolaTitle").style.display = 'none';
    const c = document.getElementById("conversationTitle");
    c.style.display = null;
    c.innerHTML = "<font size=+1><strong>Create New Conversation</strong></font><br>Select up to 7 members";
    document.getElementById('plus').style.display = 'none';
}

/**
 * Sets up the new_contact-overlay after the plus button was pressed in the contacts scenario.
 */
function menu_new_contact() {
    document.getElementById('new_contact-overlay').style.display = 'initial';
    document.getElementById('overlay-bg').style.display = 'initial';
    // document.getElementById('chat_name').focus();
    overlayIsActive = true;
}

/**
 * Sets up the edit-overlay for entering the address of a pub after the plus button was pressed in the connex scenario.
 */
function menu_new_pub() {
    menu_edit('new_pub_target', "Enter address of trustworthy pub<br><br>"
        + "Format:<br><tt>net:IP_ADDR:PORT~shs:ID_OF_PUB</tt>", "");
}

/**
 * Sets up the edit-overlay for redeeming an invite code after "Redeem invite code" was selected from the top-right menu
 * in the connex scenario.
 */
function menu_invite() {
    menu_edit('new_invite_target', "Enter invite code<br><br>Format:<br>"
        + "<tt>IP_ADDR:PORT:@ID_OF_PUB.ed25519~INVITE_CODE</tt>", "");
}

/**
 * Resends all messages when the user selects "Re-stream posts" in the settings scenario.
 */
function menu_stream_all_posts() {
    // closeOverlay();
    setScenario('chats')
    launch_snackbar("DB restreaming launched");
    backend("restream");
}

/**
 * Refreshes the UI on command. It reloads the current conversation, the list of chats and the contacts.
 */
function menu_redraw() {
    closeOverlay();

    load_chat_list()

    document.getElementById("lst:contacts").innerHTML = '';
    load_contact_list();

    if (curr_scenario === "posts")
        load_chat(curr_chat);
}

/**
 * Resets the UI but keeps the current ID.
 * Returns to chats scenario, wipes all chats, contacts, pubs, etc. but keeps the ID.
 * Does NOT delete the contact data in the backend, which is used for lookups for example.
 */
function menu_reset() {
    closeOverlay();
    resetTremola();
    setScenario('chats');
    menu_redraw();
    launch_snackbar("reloading DB");
    backend("reset");
}

/**
 * Opens the edit-overlay, in which the title is displayed along with a text input field.
 * @param target {String} Overwrites the edit_target, so other functions know what the input was for.
 * @param title {String} The title to display to the user.
 * @param text {String} The text already in the editable text field.
 */
function menu_edit(target, title, text) {
    closeOverlay()
    document.getElementById('edit-overlay').style.display = 'initial';
    document.getElementById('overlay-bg').style.display = 'initial';
    document.getElementById('edit_title').innerHTML = title;
    document.getElementById('edit_text').value = text;
    document.getElementById('edit_text').focus();
    overlayIsActive = true;
    edit_target = target;
}

/**
 * Opens an edit-overlay to change the name of a conversation when selecting the "Rename" option in the top-right menu
 * in the posts scenario or when creating a new chat in the members scenario.
 */
function menu_edit_convname() {
    menu_edit('convNameTarget',
        "Edit conversation name:<br>(only you can see this name)",
        tremola.chats[curr_chat].alias);
}

// function menu_edit_new_contact_alias() {
//   menu_edit('new_contact_alias', "Assign alias to new contact:", "");
// }

/**
 * Called when the user added a contact. Adds the contact to the tremola object in the frontend and also to the backend.
 * Opens a chat with the newly added user and saves.
 * @param alias The alias of the contact to be added.
 * @param public_key The public key of the contact to be added.
 */
function edit_confirmed_back(alias, public_key) {
    console.log("edit_confirmed_back: " + alias + ", " + public_key)
    tremola.contacts[new_contact_id] = {
        "alias": alias, "initial": alias.substring(0, 1).toUpperCase(),
        "color": colors[Math.floor(colors.length * Math.random())]
    };
    const recps = [myId, new_contact_id];
    const nm = recps2nm(recps);
    tremola.chats[nm] = {
        "alias": "Chat w/ " + alias, "posts": {}, "members": recps,
        "touched": Date.now(), "lastRead": 0
    };
    persist();
    backend("add:contact " + new_contact_id + " " + btoa(alias))
    menu_redraw();
}

/**
 * Called when an edit-overlay is closed by confirming. Depending on what the overlay was for, follows up in different
 * ways.
 * <ul>
 *     <li> Change the name of the conversation. </li>
 *     <li> Add a contact with their alias. </li>
 *     <li> Add a pub (unfinished). </li>
 *     <li> Redeem an invite code. </li>
 * </ul>
 */
function edit_confirmed() {
    closeOverlay()
    const val = document.getElementById('edit_text').value;
    if (edit_target === 'convNameTarget') { // User was editing the name of a conversation
        // Update the name and save it, redraw page
        const ch = tremola.chats[curr_chat];
        ch.alias = val;
        persist();
        load_chat_title(ch); // also have to update entry in chats
        menu_redraw();
    } else if (edit_target === 'new_contact_alias' || edit_target === 'trust_wifi_peer') { // User was adding a contact
        document.getElementById('contact_id').value = '';
        if (val === '')
            id2b32(new_contact_id, 'edit_confirmed_back')
        else
            edit_confirmed_back(val, new_contact_id)
    } else if (edit_target === 'new_pub_target') { // User was adding a pub FIXME does not do anything
        console.log("action for new_pub_target")
    } else if (edit_target === 'new_invite_target') { // User was redeeming an invite code
        backend("invite:redeem " + val)
    }
}

/**
 * Toggles the forgotten attribute of a chat. Being forgotten makes it hidden in the UI but does not delete it.
 * Your own chat will prompt an error. Forgetting a chat will put you in the chats scenario, unforgetting it will reload
 * it.
 */
function menu_forget_conv() {
    if (curr_chat === recps2nm([myId])) { // You cannot forget the chat with yourself.
        launch_snackbar("You cannot forget your own notes.");
        return;
    }
    tremola.chats[curr_chat].forgotten = !tremola.chats[curr_chat].forgotten;
    persist();
    load_chat_list() // refresh list of conversations
    closeOverlay();
    if (curr_scenario === 'posts' /* should always be true */ && tremola.chats[curr_chat].forgotten)
        setScenario('chats');
    else
        load_chat(curr_chat) // refresh currently displayed list of posts
}

/**
 * Imports the secret ID of another device onto the current one.
 * Not functional, unused.
 * TODO make this work or remove it
 */
function menu_import_id() {
    // backend('secret: XXX');
    launch_snackbar("Not functional at the moment.")
    closeOverlay();
}

/**
 * Not sure what this is for, probably fetches messages.
 * Not functional, unused.
 * TODO make this work or remove it
 */
function menu_process_msgs() {
    launch_snackbar("Not functional at the moment.")
    backend('process.msg'); // Not a valid input for the backend, does nothing
    closeOverlay();
}

/**
 * Adds a Pub via its address to the device.
 * Not functional, unused.
 * TODO make this work or remove it
 */
function menu_add_pub() {
    launch_snackbar("Not functional at the moment.")
    closeOverlay();
}

/**
 * Not sure what this is for, probably to export all data.
 * Not functional, unused.
 * TODO make this work or remove it
 */
function menu_dump() {
    launch_snackbar("Not functional at the moment.")
    backend('dump:');
    closeOverlay();
}

// ---

/**
 * Sends message to backend to be sent, displays the message, scrolls to bottom, clears text field.
 * Called when user sends a text (after preview is confirmed, should it be enabled).
 * @param s {String} The message to be sent.
 */
function new_post(s) {
    if (s.length === 0) {
        return;
    }
    // TODO escapeHTML() might be the better choice here
    var draft = unicodeStringToTypedArray(document.getElementById('draft').value);

    // If the message is self-deleting, format to standard used
    if(draft.startsWith(":deleteafter")){
       draft = getNewDraftWithDateOfMessageDeletion(draft);
    }
    // Concatenated IDs of all chat members
    const recps = tremola.chats[curr_chat].members.join(' ')
    backend("priv:post " + btoa(draft) + " " + recps);
    const c = document.getElementById('core');
    c.scrollTop = c.scrollHeight;
    document.getElementById('draft').value = '';
    closeOverlay();
}

/* This function takes a message with the prefix ':deleteafter' (should be in format ":deleteafter(0-9)*;(s|m|h|d|w)")
and gives back the date when the message should be deleted*/
function getNewDraftWithDateOfMessageDeletion(draft){
    var withoutDeleteAfter = draft.substring(12);
    var indexOfEndingChar = withoutDeleteAfter.indexOf(';');
    var amountOfTime = withoutDeleteAfter.substring(0, indexOfEndingChar);
    var withoutAmountOfTimeAndEndingChar = withoutDeleteAfter.substring(indexOfEndingChar + 1);
    var timeUnit = withoutDeleteAfter[indexOfEndingChar+1];
    if (timeUnit === "s") {
        var amountOfTimeInMS = amountOfTime * 1000;
    } else if (timeUnit === "m") {
        var amountOfTimeInMS = amountOfTime * 60 * 1000;
    } else if (timeUnit === "h") {
        var amountOfTimeInMS = amountOfTime * 60 * 60 * 1000;
    } else if (timeUnit === "d") {
        var amountOfTimeInMS = amountOfTime * 60 * 60 * 1000 * 24;
    } else if (timeUnit === "w") {
        var amountOfTimeInMS = amountOfTime * 60 * 60 * 1000 * 24 * 7;
    }
    console.log("amountOfTime:",amountOfTime);
    console.log("amountOfTimeInMS:",amountOfTimeInMS);
    var today = new Date();
    var dateOfMessageDeletion = new Date(today.getTime() + amountOfTimeInMS);
    console.log("dateNow:",today.getTime());
    console.log("dateOfMessageDeletion:",dateOfMessageDeletion.getTime());

    //Adding date to the front of t
    var newDraft = ";date;of;message;deletion;" + dateOfMessageDeletion.getTime() + ";" + withoutAmountOfTimeAndEndingChar.substring(1);
    console.log("NEW MESSAGE:",newDraft);
    return newDraft;
}

/**
 * Takes a message and puts it in the list of messages of the posts scenario.
 * @param p Message object with fields: 'key', 'from', 'when', 'body', 'to'. 'to' seems unused.
 */
function load_post_item(p) {
    const pl = document.getElementById('lst:posts');
    const is_other = p["from"] !== myId;
    // The UI box for the message
    let box = "<div class=light style='padding: 3pt; border-radius: 4px; box-shadow: 0 0 5px rgba(0,0,0,0.7);'>"
    if (is_other) // If it is from someone else, include sender's name
        box += "<font size=-1><i>" + fid2display(p["from"]) + "</i></font><br>";
    // The message content, formatted for view
    const txt = escapeHTML(p["body"]).replace(/\n/g, "<br>\n");
    // The date string of the message
    let d = new Date(p["when"]);
    d = d.toDateString() + ' ' + d.toTimeString().substring(0, 5);
    box += txt + "<div align=right style='font-size: x-small;'><i>";
    box += d + "</i></div></div>";
    let row;
    if (is_other) { // If it is from someone else, include the contact's initial on the message and put it left
        const c = tremola.contacts[p.from]
        row = "<td style='vertical-align: top;'><button class=contact_picture style='margin-right: 0.5em; margin-left: "
            + "0.25em; background: " + c.color + "; width: 2em; height: 2em;'>" + c.initial + "</button>"
        // row  = "<td style='vertical-align: top; color: var(--red); font-weight: 900;'>&gt;"
        row += "<td colspan=2 style='padding-bottom: 10px;'>" + box + "<td colspan=2>";
    } else { // If it is a message from yourself, include a < and keep it right
        row = "<td colspan=2><td colspan=2 style='padding-bottom: 10px;'>" + box;
        row += "<td style='vertical-align: top; color: var(--red); font-weight: 900;'>&lt;"
    }
    pl.insertRow(pl.rows.length).innerHTML = row;
}

/**
 * Loads the posts scenario of the chat you clicked on in the chats scenario.
 * @param nm The internal name of the chat, looks like: @AA...AA=, might be concatenated for group chats.
 */
function load_chat(nm) {
    let ch, pl, e;
    ch = tremola.chats[nm];
    pl = document.getElementById("lst:posts");

    // deletes the expired messages after the threshold time is met
    deleteOldMessages(nm);

    // Clears the current lists of posts.
    while (pl.rows.length) {
        pl.deleteRow(0);
    }
    curr_chat = nm;
    let lop = [];
    // Fill the current list of posts.
    for (const p in ch.posts) lop.push(p)
    // Sort the new list of posts by the time of arrival.
    lop.sort((a, b) => ch.posts[a].when - ch.posts[b].when)
    // Load all posts in the UI.
    lop.forEach((p) =>
        load_post_item(ch.posts[p])
    )
    load_chat_title(ch);
    setScenario("posts");
    document.getElementById("tremolaTitle").style.display = 'none';
    // Scroll to bottom:
    e = document.getElementById('core')
    e.scrollTop = e.scrollHeight;
    // Update unread badge:
    ch["lastRead"] = Date.now();
    persist();
    document.getElementById(nm + '-badge').style.display = 'none' // Is this necessary?

}

/**
 * Sets the chat title to its given name and displays the member via their aliases below. Used in posts scenario.
 * @param ch The {@link tremola}.chats element that represents the current chat.
 */
function load_chat_title(ch) {
    const c = document.getElementById("conversationTitle");
    c.style.display = null;
    c.classList = ch.forgotten ? ['gray'] : []; // FIXME: Assigned expression type string[] | any[] is not assignable
                                                //  to type DOMTokenList
    let box = "<div style='white-space: nowrap;'><div style='text-overflow: ellipsis; overflow: hidden;'>"
        + "<font size=+1><strong>" + escapeHTML(ch.alias) + "</strong></font></div>";
    box += "<div style='color: black; text-overflow: ellipsis; overflow: hidden;'>" +
        escapeHTML(recps2display(ch.members)) + "</div></div>";
    c.innerHTML = box;
}

/**
 * Loads the list of chats in the chats scenario. Chats are sorted by touch date.
 */
function load_chat_list() {
    // Set the "locked" property for each chat
    set_locked_property();

    const meOnly = recps2nm([myId]);
    // console.log('meOnly', meOnly)
    document.getElementById('lst:chats').innerHTML = '';
    load_chat_item(meOnly);
    let lop = [];
    // Load non-forgotten chats in sorted order (by touch date).
    for (let p in tremola.chats) {
        if (p !== meOnly && !tremola.chats[p]['forgotten'])
            lop.push(p);
    }
    lop.sort((a, b) => tremola.chats[b]["touched"] - tremola.chats[a]["touched"])
    lop.forEach((p) =>
        load_chat_item(p)
    )
    // Load forgotten chats if settings dictate it, unsorted.
    if (!tremola.settings.hide_forgotten_conv)
        for (const p in tremola.chats)
            if (p !== meOnly && tremola.chats[p]['forgotten'])
                load_chat_item(p)
}

/**
 * Puts a button in the chats list in the chats scenario. Loads the chat that it was given the internal name of.
 * @param nm The internal name of the chat to add, generated with {@link recps2nm}.
 */
function load_chat_item(nm) {
    let cl, mem, item, bg, row, badge, badgeId, cnt;
    cl = document.getElementById('lst:chats');
    mem = recps2display(tremola.chats[nm].members);
    item = document.createElement('div');
    item.style = "padding: 0px 5px 10px 5px; margin: 3px 3px 6px 3px;";

    // Add double lock symbol for chats with double-ratchet encryption
    let locked = tremola.chats[nm].locked ? "&#x1F512;&#x1F512;" : "&#x1F512;";

    // Switch background depending on if the chat was forgotten.
    if (tremola.chats[nm].forgotten) bg = ' gray'; else bg = ' light';
    row = "<button class='chat_item_button w100" + bg + "' onclick='load_chat(\"" + nm + "\");' style='overflow: "
        + "hidden; position: relative;'><div style='white-space: nowrap;'><div style='text-overflow: ellipsis; "
        + "overflow: hidden;'>" + locked + " " +tremola.chats[nm].alias + "</div><div style='text-overflow: clip; "
        + "overflow: ellipsis;'><font size=-2>" + escapeHTML(mem) + "</font></div></div>";
    badgeId = nm + "-badge";
    badge = "<div id='" + badgeId + "' style='display: none; position: absolute; right: 0.5em; bottom: 0.9em; "
        + "text-align: center; border-radius: 1em; height: 2em; width: 2em; background: var(--red); color: "
        + "white; font-size: small; line-height:2em;'>&gt;9</div>";
    row += badge + "</button>";
    row += ""
    item.innerHTML = row;
    cl.append(item);
    set_chats_badge(nm)
}

/**
 * Loads the list of contacts in the contacts scenario. They are ordered by their creation date.
 */
function load_contact_list() {
    document.getElementById("lst:contacts").innerHTML = '';
    for (const id in tremola.contacts)
        if (!tremola.contacts[id].forgotten) // Load non-forgotten contacts.
            load_contact_item([id, tremola.contacts[id]]);
    if (!tremola.settings.hide_forgotten_contacts) // Load forgotten contacts if the settings dictate it.
        for (const id in tremola.contacts) {
            const c = tremola.contacts[id]
            if (c.forgotten)
                load_contact_item([id, c]);
        }
}

/**
 * This loads the provided contact into the contact list. Used in the contacts scenario.
 * @param c The contact object, example: [id, {"alias": "<alias>", "initial": "<A>", "color": "<#123456>" }].
 */
function load_contact_item(c) {
    let row, item = document.createElement('div'), bg;
    item.style = "padding: 0px 5px 10px 5px;";
    if (!("initial" in c[1])) {
        c[1]["initial"] = c[1].alias.substring(0, 1).toUpperCase();
        persist();
    }
    if (!("color" in c[1])) {
        c[1]["color"] = colors[Math.floor(colors.length * Math.random())];
        persist();
    }
    // console.log("load_c_i", JSON.stringify(c[1]))
    bg = c[1].forgotten ? ' gray' : ' light'; // Change background depending on whether the contact is forgotten.
    row = "<button class=contact_picture style='margin-right: 0.75em; background: " + c[1].color + ";'>" + c[1].initial
        + "</button><button class='chat_item_button" + bg + "' style='overflow: hidden; width: calc(100% - 4em);' "
        + "onclick='show_contact_details(\"" + c[0] + "\");'><div style='white-space: nowrap;'>"
        + "<div style='text-overflow: ellipsis; overflow: hidden;'>" + escapeHTML(c[1].alias) + "</div>"
        + "<div style='text-overflow: clip; overflow: ellipsis;'><font size=-2>" + c[0]
        + "</font></div></div></button>";
    // var row  = "<td><button class=contact_picture></button><td style='padding: 5px;'>"
    //     + "<button class='contact_item_button light w100'>";
    // row += escapeHTML(c[1].alias) + "<br><font size=-2>" + c[0] + "</font></button>";
    // console.log(row);
    item.innerHTML = row;
    document.getElementById('lst:contacts').append(item);
}

/**
 * Sets up the UI to display all contacts as a list of options with checkboxes which can be selected.
 * This is vital for the scenario members.
 */
function fill_members() {
    let choices = '';
    for (let m in tremola.contacts) {
        choices += '<div style="margin-bottom: 10px;"><label><input type="checkbox" id="' + m;
        choices += '" style="vertical-align: middle;"><div class="contact_item_button light" '
            + 'style="white-space: nowrap; width: calc(100% - 40px); padding: 5px; vertical-align: middle;">';
        choices += '<div style="text-overflow: ellipis; overflow: hidden;">' + escapeHTML(fid2display(m)) + '</div>';
        choices += '<div style="text-overflow: ellipis; overflow: hidden;"><font size=-2>' + m + '</font></div>';
        choices += '</div></label></div>\n';
    }
    document.getElementById('lst:members').innerHTML = choices
    /*
      <div id='lst:members' style="display: none;margin: 10pt;">
        <div style="margin-top: 10pt;"><label><input type="checkbox" id="toggleSwitches2" style="margin-right: 10pt;">
        <div class="contact_item_button light" style="display: inline-block;padding: 5pt;">Choice1<br>more text</div>
        </label></div>
      </div>
    */
    document.getElementById(myId).checked = true;
}

/**
 * Used for opening the overlay to edit and view a contact's information. Called when pressing on a contact in the
 * contacts scenario.
 * Gets the shortname of the id provided and calls {@link show_contact_details_back} with <shortname>, id as parameters.
 * @param id {String} The SSB ID of the contact, example: @AA...AA=.ed25519
 */
function show_contact_details(id) {
    id2b32(id, 'show_contact_details_back')
}

/**
 * Opens the overlay to edit and view a contact's information.
 * FIXME Works on mobile, does not work in browser.
 * @param shortname {String} Generated string by {@link id2b32}, represents hash of long public key.
 * @param id {String} The SSB ID of the contact, example: @AA...AA=.ed25519
 */
function show_contact_details_back(shortname, id) {
    const c = tremola.contacts[id];
    new_contact_id = id;
    document.getElementById('old_contact_alias').value = c['alias'];
    let details = '';
    details += '<br><div>Shortname: &nbsp;' + shortname + ' </div>\n';
    details += '<br><div style="word-break: break-all;">SSB identity: &nbsp;<tt>' + id + '</tt></div>\n';
    details += '<br><div class=settings style="padding: 0px;"><div class=settingsText>Forget this contact</div><div '
        + 'style="float: right;"><label class="switch"><input id="hide_contact" type="checkbox" '
        + 'onchange="toggle_forget_contact();"><span class="slider round"></span></label></div></div>'
    document.getElementById('old_contact_details').innerHTML = details;
    document.getElementById('old_contact-overlay').style.display = 'initial';
    document.getElementById('overlay-bg').style.display = 'initial';
    document.getElementById('hide_contact').checked = c.forgotten;

    document.getElementById('old_contact_alias').focus();
    overlayIsActive = true;
}

/**
 * Toggles the forgotten field of a contact, saves and reloads.
 */
function toggle_forget_contact() {
    const c = tremola.contacts[new_contact_id];
    c.forgotten = !c.forgotten;
    persist();
    closeOverlay();
    load_contact_list();
}

/**
 * Save a nickname for a user.
 * If not present, save its shortname (computed by the backend) as alias.
 * The backend calls the method {@link save_content_alias_back} directly.
 */
function save_content_alias() {
    let alias = document.getElementById('old_contact_alias').value;
    if (alias === '')
        id2b32(new_contact_id, 'save_content_alias_back');
    else
        save_content_alias_back(alias, new_contact_id)
}

/**
 * Saves the provided alias for the new_contact_id user, creates the contact in the process and saves it.
 * @param alias {String} The selected alias, must not be empty.
 * @param new_contact_id {String} The SSB ID of the contact. Looks like: @AA...AA=.ed25519
 */
function save_content_alias_back(alias, new_contact_id) {
    tremola.contacts[new_contact_id].alias = alias;
    tremola.contacts[new_contact_id].initial = alias.substring(0, 1).toUpperCase();
    tremola.contacts[new_contact_id].color = colors[Math.floor(colors.length * Math.random())];
    persist();
    menu_redraw();
    closeOverlay();
}

/**
 * Generates a new conversation in chats. Called when clicking on the checkmark button in the members scenario.
 * If the chat exists but is forgotten, unforgets it and touches it. If it already exists, launches error snackbar.
 * FIXME updates title when creating new chats in chats scenario, prompting two titles.
 */
function new_conversation() {
    // { "alias":"local notes (for my eyes only)", "posts":{}, "members":[myId], "touched": millis }
    // Contains selected contacts.
    let recps = []
    for (const m in tremola.contacts) {
        if (document.getElementById(m).checked)
            recps.push(m);
    }
    // In case that the user unselects themselves, adds oneself to conversation.
    if (recps.indexOf(myId) < 0)
        recps.push(myId);
    // Check that not too many people are selected.
    if (recps.length > 7) {
        launch_snackbar("Too many recipients");
        return;
    }
    // Contains the internal name of the chat.
    const cid = recps2nm(recps)
    // Chat already exists: if forgotten unforget, otherwise display error.
    if (cid in tremola.chats) {
        if (tremola.chats[cid].forgotten) {
            tremola.chats[cid].forgotten = false;
            load_chat_list(); // refresh
        } else
            launch_snackbar("Conversation already exists");
        return;
    }
    // TODO remove this variable, is the same as cid above.
    const nm = recps2nm(recps);
    if (!(nm in tremola.chats)) { // Create new chat, save.
        tremola.chats[nm] = {
            "alias": "Unnamed conversation", "posts": {},
            "members": recps, "touched": Date.now()
        };
        persist();
    } else // Touch it if it was forgotten
        tremola.chats[nm]["touched"] = Date.now();
    load_chat_list();
    setScenario("chats");
    curr_chat = nm;
    menu_edit_convname();
}

/**
 * Displays {@link localPeers} as a list in the connex scenario.
 */
function load_peer_list() {
    let i, lst = '';
    for (i in localPeers) {
        let x = localPeers[i], color, row, nm, tmp;
        if (x[1]) color = ' background: var(--lightGreen);'; else color = ''; // Make it light green if connected
        tmp = i.split('~');
        nm = '@' + tmp[1].split(':')[1] + '.ed25519';
        if (nm in tremola.contacts) // Already known and in contacts, use alias.
            nm = ' / ' + tremola.contacts[nm].alias
        else
            nm = ''
        row = "<button class='flat buttontext' style='border-radius: 25px; width: 50px; height: 50px; "
            + "margin-right: 0.75em;" + color + "'><img src=img/signal.svg style='width: 50px; height: 50px; "
            + "margin-left: -3px; margin-top: -3px; padding: 0px;'></button><button class='chat_item_button light' "
            + "style='overflow: hidden; width: calc(100% - 4em);' onclick='show_peer_details(\"" + i + "\");'>"
            + "<div style='white-space: nowrap;'><div style='text-overflow: ellipsis; overflow: hidden;'>"
            + tmp[0].substring(4) + nm + "</div><div style='text-overflow: clip; overflow: ellipsis;'><font size=-2>"
            + tmp[1].substring(4) + "</font></div></div></button>";
        lst += '<div style="padding: 0px 5px 10px 5px;">' + row + '</div>';
        // console.log(row)
    }
    document.getElementById('the:connex').innerHTML = lst;
}

/**
 * Displays the possibility of adding someone to their own contacts from {@link localPeers} when pressing on an entry in
 * the connex scenario.
 * @param id The SSB ID of the peer.
 */
function show_peer_details(id) {
    new_contact_id = "@" + id.split('~')[1].substring(4) + ".ed25519";
    // if (new_contact_id in tremola.contacts)
    //  return;
    menu_edit("trust_wifi_peer", "Trust and Autoconnect<br>&nbsp;<br><strong>" + new_contact_id
        + "</strong><br>&nbsp;<br>Should this Wi-Fi peer be trusted (and autoconnected to)? "
        + "Also enter an alias for the peer - only you will see this alias", "?")
}

/**
 * Returns the number of unread messages in a chat.
 * @param nm {String} The internal name of a chat, generated with {@link recps2nm}.
 * @returns {number} The number of unread messages.
 */
function getUnreadCnt(nm) {
    let c = tremola.chats[nm], cnt = 0;
    for (const p in c.posts) {
        if (c.posts[p].when > c.lastRead)
            cnt++;
    }
    return cnt;
}

/**
 * Shows a badge with a number on it on a chat, representing how many unread messages there are. Used in the chats
 * scenario.
 * @param nm {String} The internal chat name, generated with {@link recps2nm}.
 */
function set_chats_badge(nm) {
    let e = document.getElementById(nm + '-badge'), cnt;
    cnt = getUnreadCnt(nm)
    if (cnt === 0) {
        e.style.display = 'none';
        return
    }
    e.style.display = null;
    if (cnt > 9) cnt = ">9"; else cnt = "" + cnt;
    e.innerHTML = cnt
}

// --- util

/**
 * Escapes special unicode characters to binary strings,
 * TODO quality control: does this really work? Is this description accurate? Is this secure?
 * @param s {String} The string to be encoded.
 * @returns {string} The result with binary.
 */
function unicodeStringToTypedArray(s) {
    const escstr = encodeURIComponent(s);
    return escstr.replace(/%([\dA-F]{2})/g, function (match, p1) {
        return String.fromCharCode('0x' + p1);
    });
}

/**
 * Takes a string from which it derives a shortname, then calls method_name(<shortname>, str).
 * @param str {String} The string to generate a shortname from, typically an SSB ID.
 * @param method_name {String} The method which is called afterwards with arguments <shortname> and str.
 */
function id2b32(str, method_name) {
    try {
        backend("priv:hash " + str + " " + method_name);
    } catch (err) {
        console.error(err)
    }
}

/**
 * Takes a string and returns string with securely escaped HTML characters.
 * @param str {String} The string to escape.
 * @returns {string} The escaped string.
 */
function escapeHTML(str) {
    return new Option(str).innerHTML;
}

/**
 * Takes a list of SSB IDs, sorts them, concatenates them and removes all .ed25519.
 * Usually used to derive an internal name for a chat or a contact.
 * @param rcps {[String]} An array of SSB IDs.
 * @returns {String} The initial IDs, sorted, concatenated with the .ed25519 removed. Looks like:
 * "@A..A=@B..B=@C..C="
 */
function recps2nm(rcps) {
    const name = rcps.sort().join('').replace(/.ed25519/g, '')
    console.log(name)
    return name
}

/**
 * Takes a machine-readable list of recipients and returns them as a list of concatenated aliases.
 * @param rcps The recipients in the machine-readable form: @AA...AA=, aka FID.
 * @returns {string} Human-readable recipients list, enclosed in brackets.
 */
function recps2display(rcps) {
    const lst = rcps.map(fid => {
        return fid2display(fid)
    });
    return '[' + lst.join(', ') + ']';
}

/**
 * Finds a fitting alias for a contact's ID.
 * It takes a friend's ID, looks it up in the tremola.contacts dictionary and retrieves the alias.
 * If nothing was found or the alias is empty, returns the first 9 letters of the contact.
 * @param fid The SSB ID of a friend.
 * @returns {string} The most fitting alias for the ID.
 */
function fid2display(fid) {
    let a = '';
    if (fid in tremola.contacts)
        a = tremola.contacts[fid].alias;
    if (a === '')
        a = fid.substring(0, 9);
    return a;
}

// --- Interface to Kotlin side and local (browser) storage

/**
 * Takes a string to send to the Kotlin backend.
 * If we are not on an Android device, this simulates the most basic functionality of the actual backend for in-browser
 * testing.
 * @param cmdStr The string that gets passed to the backend or is used for the simulated response.
 */
function backend(cmdStr) {
    if (typeof Android != 'undefined') { // Android device: simply call backend
        Android.onFrontendRequest(cmdStr);
        return;
    }

    // Only called on non-Android devices: Simulating the backend functionality for in-browser testing
    cmdStr = cmdStr.split(' ')
    if (cmdStr[0] === 'ready')
        b2f_initialize('@AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=.ed25519')
    else if (cmdStr[0] === 'exportSecret')
        b2f_showSecret('secret_of_id_which_is@AAAA==.ed25519')
    else if (cmdStr[0] === 'priv:post') {
        const draft = atob(cmdStr[1])
        cmdStr.splice(0, 2)
        const e = {
            'header': {
                'tst': Date.now(),
                'ref': Math.floor(1000000 * Math.random()),
                'fid': myId
            },
            'confid': {'type': 'post', 'text': draft, 'recps': cmdStr},
            'public': {}
        }
        // console.log('e=', JSON.stringify(e))
        b2f_new_event(e)
    } else {
        // console.log('backend', JSON.stringify(cmdStr))
    }
}

/**
 * Resets the browser-side content and initializes the tremola object.
 * Initializes the tremola object with one's ID, opens a chat with oneself, adds oneself to contacts and saves.
 */
function resetTremola() { // wipes browser-side content
    tremola = {
        "chats": {},
        "contacts": {},
        "profile": {},
        "id": myId,
        "settings": get_default_settings()
    }
    const n = recps2nm([myId])
    tremola.chats[n] = {
        "alias": "local notes (for my eyes only)", "posts": {}, "forgotten": false,
        "members": [myId], "touched": Date.now(), "lastRead": 0
    };
    tremola.contacts[myId] = {"alias": "me", "initial": "M", "color": "#bd7578", "forgotten": false};
    persist();
}

/**
 * Saves the tremola object to local storage.
 */
function persist() {
    // console.log(tremola);
    window.localStorage.setItem("tremola", JSON.stringify(tremola));
}
/**
*   Saves the set dropdown settings for the threshold to local storage
*/
function persistDropdown() {
    window.localStorage.setItem("dropdown", JSON.stringify(unitNumberTuple));
    //console.log('json dropdown stringify: ', JSON.stringify(unitNumberTuple));
}

/**
*   Reads the dropdown settings from local storage and transfers its values to the unitNumberTuple to be worked with.
*/
function getDropdown() {
    unitNumberTuple = JSON.parse(window.localStorage.getItem("dropdown"));
    //logs for debug purposes
    //console.log('unitNumberTuple 0, 1 and 2 with parse from json: ', unitNumberTuple[0], unitNumberTuple[1], unitNumberTuple[2]);
    //console.log('json dropdown parse: ', JSON.parse(window.localStorage.getItem("dropdown")));
}

/**
* Sets the dropdown menu settings from the data on local storage. If the data on local storage is empty nothing happens.
* Because the threshold was not yet setup after newly installation we don't need a value in the fields it displays the default.
*/
function setDropdown() {
    var dropdown = document.getElementById("time-select");
    var textareaDrop = document.getElementById("timer-text");
    unitNumberTuple = JSON.parse(window.localStorage.getItem("dropdown"));//this object is null when app is started for the first time ever on new installation
    if (unitNumberTuple != null && unitNumberTuple != undefined) {//to prevent the uncaught error this if statement is add
        var storedUnit = unitNumberTuple[0];//before: uncaught error null when the app is started first time ever
        var storedNumber = unitNumberTuple[1];
        del_msg_bool = unitNumberTuple[2];
        if (storedUnit && storedNumber) {
            dropdown.value = storedUnit;
            textareaDrop.value = storedNumber;
        }
    }

}

function b2f_local_peer(p, status) { // wireless peer: online, offline, connected, disconnected
    console.log("local peer", p, status);
    if (!(p in localPeers))
        localPeers[p] = [false, false]
    if (status === 'online') localPeers[p][0] = true
    if (status === 'offline') localPeers[p][0] = false
    if (status === 'connected') localPeers[p][1] = true
    if (status === 'disconnected') localPeers[p][1] = false
    if (!localPeers[p][0] && !localPeers[p][1])
        delete localPeers[p]
    load_peer_list()
}

/**
 * After a lookup returns a result, a snackbar is launched displaying the result.
 * @param shortname The shortname that we searched for initially.
 * @param public_key The found public key of the person that was looked up.
 */
function snackbar_lookup_back(shortname, public_key) {
    launch_snackbar(shortname + " : " + public_key)
}

/**
 * TODO seems to be unused. If you know what this is for, please update this documentation or remove it.
 * @param target_short_name
 * @param new_contact_id
 */
function b2f_new_contact_lookup(target_short_name, new_contact_id) {
    console.log(`new contact lookup ${target_short_name}, ${new_contact_id}`);
    id2b32(new_contact_id, 'snackbar_lookup_back')
    // launch_snackbar(target_short_name, " : ", await id2b32(new_contact_id));

    tremola.contacts[new_contact_id] = {
        "alias": target_short_name,
        "initial": target_short_name.substring(0, 1).toUpperCase(),
        "color": colors[Math.floor(colors.length * Math.random())]
    };
    const recps = [myId, new_contact_id];
    const nm = recps2nm(recps);
    tremola.chats[nm] = {
        "alias": "Chat w/ " + target_short_name, "posts": {}, "members": recps,
        "touched": Date.now(), "lastRead": 0
    };
    persist();
    menu_redraw();
}

/**
 * Called when an SSB log event is incoming, we receive an object with three fields: header, confid, public.
 * Typically called from backend. This object is added to the respective chat.
 * @param e Event object. Looks like this, example is mocking what the frontend expects:
 * 'header': {'tst': Date.now(), 'ref': Math.floor(1000000 * Math.random()), 'fid': myId}, 'confid': {'type': 'post',
 * 'text': draft, 'recps': cmdStr}, 'public': {}
 */
function b2f_new_event(e) {
    //console.log('hdr', JSON.stringify(e.header))
    // console.log('pub', JSON.stringify(e.public))
    // console.log('cfd', JSON.stringify(e.confid))
    if (e.confid && e.confid.type === 'post') {
        if (e.confid.text === "") { // Message is empty or failed to decrypt: Do nothing.
            return
        }
        let i, conv_name = recps2nm(e.confid.recps);
        if (!(conv_name in tremola.chats)) { // Create new conversation if needed.
            tremola.chats[conv_name] = {
                "alias": "Unnamed conversation", "posts": {},
                "members": e.confid.recps, "touched": Date.now(), "lastRead": 0
            };
            load_chat_list()
        }
        for (i in e.confid.recps) { // If it was a group message and not all recipients are known, add them to contacts.
            let id, r = e.confid.recps[i];
            if (!(r in tremola.contacts))
                id2b32(r, 'b2f_new_event_back')
        }
        const ch = tremola.chats[conv_name];
        if (!(e.header.ref in ch.posts)) { // New post, add to posts list (chat).
            // var d = new Date(e.header.tst);
            // d = d.toDateString() + ' ' + d.toTimeString().substring(0,5);
            ch["posts"][e.header.ref] = {
                "key": e.header.ref,
                "from": e.header.fid,
                "body": e.confid.text,
                "when": e.header.tst // FIXME setting it to the time of sending might lead to messages being
                                     //  considered read, if the user visited the chat without connection between the
                                     //  the time of sending and reception.
            };

            if(ch["posts"][e.header.ref].body.startsWith(";date;of;message;deletion;")){
                handleMessageWithDeletionOnReceiver(ch["posts"][e.header.ref]);
            }
            if (ch["touched"] < e.header.tst)
                ch["touched"] = e.header.tst
            if (curr_scenario === "posts" && curr_chat === conv_name) {
                load_chat(conv_name); // reload all messages (not very efficient ...)
                ch["lastRead"] = Date.now();
            }
            set_chats_badge(conv_name)
        }
        // if (curr_scenario == "chats") // the updated conversation could bubble up
        load_chat_list();
        // console.log(JSON.stringify(tremola))
    }
    persist();
    must_redraw = true;
}

/* This function takes care of self-deleting messages on the receiving side*/
function handleMessageWithDeletionOnReceiver(p){
    var body = p.body;
    var bodyWithoutPrefix = body.substring(26);
    var indexOfEndingChar = bodyWithoutPrefix.indexOf(';');
    var timeOfDeletion = bodyWithoutPrefix.substring(0,indexOfEndingChar).trim();
    p.deleteAfter = parseInt(timeOfDeletion);
    p.body = bodyWithoutPrefix.substring(timeOfDeletion.length);
    p.body = p.body.substring(1);
    var dateOfDeletion = new Date(p.deleteAfter),
        dateFormat = [
                   dateOfDeletion.getDate(),
                   dateOfDeletion.getMonth()+1,
                   dateOfDeletion.getFullYear()].join('/')+' '+
                  [dateOfDeletion.getHours(),
                   dateOfDeletion.getMinutes(),
                   dateOfDeletion.getSeconds()].join(':')
    //TODO Add color for message deletion text
    p.body = p.body + "\n\nThis Message will be deleted on " + dateFormat ;
}

/**
 * Upon receiving a group message where not all recipients are known, this function is called for each unknown.
 * Then, a contact is created for each, with their shortname as alias. Typically called from backend.
 * @param shortname The shortname of the user's public key.
 * @param publicKey The actual public key of the user.
 */
function b2f_new_event_back(shortname, publicKey) {
    tremola.contacts[publicKey] = {
        "alias": shortname, "initial": shortname.substring(0, 1).toUpperCase(),
        "color": colors[Math.floor(colors.length * Math.random())]
    }
    load_contact_list()
}

/**
 * TODO seems to be unused. If you know what this is for, please update this documentation or remove it.
 * @param contact_str
 */
function b2f_new_contact(contact_str) { // '{"alias": "nickname", "id": "fid", 'img' : base64, date}'
    const c = JSON.parse(contact_str)
    load_contact_item(c)
}

/**
 * Called when "Export secret key" button is pressed in settings. Goes to previous scenario and displays secret key as
 * QR code. Typically called from backend.
 * @param json {String} The stringified version of the exported secret key.
 */
function b2f_showSecret(json) {
    setScenario(prev_scenario);
    generateQR(json)
}

/**
 * Sets the app's ID to the provided one, loads the tremola object from browser storage, resets and initializes frontend
 * if tremola object is empty, loads settings, loads chats and contacts and goes to chats scenario. Normally called from
 * the backend.
 * @param id The ID that tremola should use as one's own.
 */
function b2f_initialize(id) {
    myId = id
    if (window.localStorage.tremola) {
        tremola = JSON.parse(window.localStorage.getItem('tremola'));
        if (tremola != null && id !== tremola.id) // check for clash of IDs, erase old state if new
            tremola = null;
    } else
        tremola = null;
    if (tremola == null) {
        resetTremola();
    }
    if (typeof Android == 'undefined')
        console.log("loaded ", JSON.stringify(tremola)) // prints debug information if simulating frontend in browser
    if (!('settings' in tremola))
        tremola.settings = {}
    let nm;
    for (nm in tremola.settings)
        setSetting(nm, tremola.settings[nm])//TODO Figure out what this does
    load_chat_list()
    load_contact_list()
    closeOverlay();
    setScenario('chats');
}

/**
 * Deletes the posts that exceed the specified threshold of time in the settings.
 * Uses the firstRead property of the posts to determine whether this threshold has been exceeded
 */
function deleteOldMessages(chat) {
    //TODO TEST
    for (var post in tremola.chats[chat].posts) {
          let today = new Date();
          //if the post has first been read more than a certain amount of time, delete it
          if (
            tremola.chats[chat].posts.hasOwnProperty(post) &&
            tremola.chats[chat].posts[post] !== null &&
            tremola.chats[chat].posts[post] !== undefined
          ) {
                if(del_msg_bool && (today.getTime() - tremola.chats[chat].posts[post].when >= timeThreshold)){
                    delete tremola.chats[chat].posts[post];
                } else if (tremola.chats[chat].posts[post].hasOwnProperty('deleteAfter') &&
                    tremola.chats[chat].posts[post].deleteAfter !== null &&
                    tremola.chats[chat].posts[post].deleteAfter !== undefined &&
                    tremola.chats[chat].posts[post].deleteAfter <= today.getTime()
                ){
                    delete tremola.chats[chat].posts[post];
                }

          }
    }
}

var textarea;
var textareaValue;
var dropDown;
var selectValue;
/**
*   Recovers saved storage of the threshold from previous session if existing.
*/
function setThreshold() {
    textarea = document.getElementById("timer-text");//value as element
    textareaValue = textarea.value;//value in numbers
    dropDown = document.getElementById("time-select");//unit element
    selectValue = dropDown.value;//the unit
    //recovers already saved data from storage
    getDropdown();
    //if this data is not undefined or not null enter if statement
    if (!textareaValue && !selectValue && unitNumberTuple != null && unitNumberTuple != undefined) {
        //if is entered when textarea and selectvalue are empty or default after restarting the app because the displayed inputs from saved storage does not trigger the entering values and selection
        //debug reasons
        //console.log("enters if statement in l 1151: ",selectValue,unitNumberTuple[0], textareaValue, unitNumberTuple[1]);
        //console.log("enters if statement in l 1151: ",selectValue,unitNumberTuple[0], textareaValue, unitNumberTuple[1]);
        //recovers the saved values from the storage with the tuple
        textareaValue = unitNumberTuple[1];
        selectValue = unitNumberTuple[0];
        //console.log("enters if statement in l 1151: ",selectValue,unitNumberTuple[0], textareaValue, unitNumberTuple[1]);
    }
    //unitNumberTuple is loaded with the current values inside the textarea and dropdown menu in the gui
    unitNumberTuple = [String(selectValue), String(textareaValue), del_msg_bool];
    var regex = /^\d+$/;
    //checks the values and boolean to set the correct amount of milliseconds
    if (regex.test(textareaValue) && del_msg_bool) {
        //debug reasons
        //console.log("is a number", textareaValue);
        if (selectValue === "seconds") {
            timeThreshold = textareaValue * 1000;
        } else if (selectValue === "minutes") {
            timeThreshold = textareaValue * 60 * 1000;
        } else if (selectValue === "hours") {
            timeThreshold = textareaValue * 60 * 60 * 1000;
        } else if (selectValue === "days") {
            timeThreshold = textareaValue * 60 * 60 * 1000 * 24;
        } else if (selectValue === "weeks") {
            timeThreshold = textareaValue * 60 * 60 * 1000 * 24 * 7;
        } else {
            //debug reasons
            console.log("no unit selected");
            return
        }
        //debug reasons
        console.log("value in: unit of ", selectValue);
        console.log("threshold in milliseconds", timeThreshold);
    } else {
        console.log("is not a number or del_msg_bool is false: ", textareaValue, del_msg_bool);
        return//after the toggle is switched on and off it console.logs the correct values already stored in there
    }
    persistDropdown();
    setDropdown();
}

/**
 * Sets the "locked" property of a chat according to whether the chat is between two people
 * (only chats between two people are double-ratchet encrypted)
 */

function set_locked_property(){
    for(var chat in tremola.chats){
        // One recipient has one "@"-symbol, thus when 2"@"-symbols are in the recps2nm-string, two people are involved in the chat
        var amountOfRecipients = recps2nm(tremola.chats[chat].members).split("@").length - 1;
        if(amountOfRecipients == 2){
            tremola.chats[chat].locked = true;
        } else {
            tremola.chats[chat].locked = false;
        }
    }
}
// --- eof
