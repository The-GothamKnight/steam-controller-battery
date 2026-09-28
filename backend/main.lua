local millennium = require("millennium")
local http = require("http")
local json = require("json")

local XENON_URL = "http://127.0.0.1:3030/state/set"
local XENON_STATE_URL = "http://127.0.0.1:3030/state/get"
local STATE_NAME = "steam-controller-state"
local MAX_VALUE_BYTES = 200
local DISCONNECTED_STATE = [[{"connected":false,"battery":null,"charging":false,"wireless":false,"syncing":false}]]

local function response(ok, error, published)
    return { ok = ok, error = error, published = published }
end

local function decode_state(value)
    if type(value) ~= "string" or #value == 0 or #value > MAX_VALUE_BYTES then
        return nil, "bad_value"
    end

    local ok_decode, decoded = pcall(json.decode, value)
    if not ok_decode or type(decoded) ~= "table" then
        return nil, "bad_state"
    end
    return decoded
end

local function post_state(value)
    local request_body = json.encode({ name = STATE_NAME, value = value })
    local res, err = http.request(XENON_URL, {
        method = "POST",
        data = request_body,
        headers = {
            ["Content-Type"] = "application/json",
            ["Accept"] = "application/json",
        },
        timeout = 2,
        follow_redirects = false,
    })

    if not res then
        local error_message = "xenon_offline: " .. tostring(err or "unknown"):sub(1, 120)
        return false, error_message
    end
    if tonumber(res.status) ~= 200 then
        local error_message = "xenon_http_" .. tostring(res.status)
        return false, error_message
    end

    local ok_body, body = pcall(json.decode, res.body or "")
    if not ok_body or type(body) ~= "table" then
        return false, "xenon_bad_response"
    end
    if body.ok ~= true then
        local error_message = tostring(body.error or "xenon_rejected")
        return false, error_message
    end

    return true
end

---@ffi
---@param value string
---@return table
function publish_state(value)
    local _, validation_error = decode_state(value)
    if validation_error then return response(false, validation_error, false) end

    local ok, err = post_state(value)
    if not ok then return response(false, err, false) end
    return response(true, nil, true)
end

local function states_match(current, wanted)
    if type(current) ~= "table" then return false end
    return current.connected == wanted.connected
        and current.battery == wanted.battery
        and current.charging == wanted.charging
        and current.wireless == wanted.wireless
        and current.syncing == wanted.syncing
end

---@ffi
---@param value string
---@return table
function ensure_state(value)
    local wanted, validation_error = decode_state(value)
    if validation_error then return response(false, validation_error, false) end

    local res, err = http.request(XENON_STATE_URL, {
        method = "GET",
        headers = { ["Accept"] = "application/json" },
        timeout = 2,
        follow_redirects = false,
    })
    if not res then
        return response(false, "xenon_offline: " .. tostring(err or "unknown"):sub(1, 120), false)
    end
    if tonumber(res.status) ~= 200 then
        return response(false, "xenon_http_" .. tostring(res.status), false)
    end

    local ok_body, body = pcall(json.decode, res.body or "")
    if not ok_body or type(body) ~= "table" or body.ok ~= true or type(body.states) ~= "table" then
        return response(false, "xenon_bad_response", false)
    end

    local current_value = body.states[STATE_NAME]
    if type(current_value) == "string" then
        local ok_state, current = pcall(json.decode, current_value)
        if ok_state and states_match(current, wanted) then
            return response(true, nil, false)
        end
    end

    local ok, post_error = post_state(value)
    if not ok then return response(false, post_error, false) end
    return response(true, nil, true)
end

local function on_load()
    print("[Steam Controller Battery] backend loaded")
    millennium.ready()
end

-- This is best effort for plugin disable or a clean backend shutdown. Full
-- Steam exit is handled earlier by the frontend ShutdownStart subscription.
local function on_unload()
    post_state(DISCONNECTED_STATE)
end

-- Current Steam desktop anchor: the semantic TitleBarControls icon bar. The
-- component owns the native children list. The placement transform prepends
-- the indicator before the first native child, without depending on the
-- optional announcements control.
local function get_patches()
    return {
        {
            find = [[const \w+=\w+\.memo\(function\(\w+\)\{const\{className:\w+,\.\.\.\w+\}=\w+;return\(0,\w+\.jsx\)\("div",\{className:\(0,\w+\.A\)\(\w+\(\)\.TitleBarControls,\w+\),\.\.\.\w+,children:\(0,\w+\.jsxs\)\(\w+\.wC,\{children:\[.*?\]\}\)\}\)\}\)]],
            file = [[chunk~[0-9a-f]+\.js]],
            transforms = {
                {
                    match = [[(\(0,(\w+)\.jsx\)\(fr,\{\}\))]],
                    replace = [[(0,\2.jsx)(#{{self}}?.SteamBatteryIndicator||(()=>null),{}),\1]],
                },
            },
        },
    }
end

return {
    on_load = on_load,
    on_unload = on_unload,
    patches = get_patches(),
}
