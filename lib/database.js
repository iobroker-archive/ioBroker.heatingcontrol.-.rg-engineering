/* eslint-disable prefer-template */
"use strict";

const findObjectByKey = require("./support_tools.js").findObjectByKey;
const findObjectsByKey = require("./support_tools.js").findObjectsByKey;
const Check4ValidTemperature = require("./support_tools.js").Check4ValidTemperature;
const CheckValidTime = require("./support_tools.js").CheckValidTime;
const timeConverter = require("./support_tools.js").timeConverter;
const GetTranslation = require("./support_tools.js").GetTranslation;

const regulator_start = require("./regulators.js").regulator_start;
const regulator_GetStatus = require("./regulators.js").regulator_GetStatus;

const Vis_SetCurrentProfile = require("./vis.js").SetCurrentProfile;
const Vis_SetCurrentTimePeriod = require("./vis.js").SetCurrentTimePeriod;
const Vis_SetStatuslog = require("./vis.js").SetStatuslog;
const Vis_SetTemperaturOverrideRemainingTime = require("./vis.js").SetTemperaturOverrideRemainingTime;

const NumberOfPeriodsinVis = require("./cronjobs").NumberOfPeriodsinVis;
const CreateCronJobs = require("./cronjobs").CreateCronJobs;
const StartTimer2ResetFireplaceMode = require("./cronjobs").StartTimer2ResetFireplaceMode;

const ErrorLog = require("./logging.js").ErrorLog;
const ActorLog = require("./logging.js").ActorLog;
const ThermostatLog = require("./logging.js").ThermostatLog;
const WindowLog = require("./logging.js").WindowLog;
const StartExtendedLog = require("./logging.js").StartExtendedLog;
const SetSystemLanguage = require("./logging.js").SetSystemLanguage;

const StartActors = require("./actor_ext.js").StartActors;
const setActorState = require("./actor_ext.js").setActorState;
 
let parentAdapter;
const ActorsWithoutThermostat = [];
const Actors = [];
const Sensors = [];
const AddTempSensors = [];
const Thermostats = [];
const Rooms = [];

let SystemLanguage = "de";

//*******************************************************************
//
async function CreateDatabase(adapter, language) {

    parentAdapter = adapter;
    SystemLanguage = language;

    SetSystemLanguage(language);

    parentAdapter.log.info("start CreateDatabase");

    StartExtendedLog(adapter);

    try {
        //create rooms
        for (let room = 0; room < parentAdapter.config.rooms.length; room++) {
            if (parentAdapter.config.rooms[room].isActive) {

                const sensors = await GetSensorsId4Room(parentAdapter.config.rooms[room].name);
                const addTempSensors = await GetAddTempSensorsId4Room(parentAdapter.config.rooms[room].name);
                const actors = await GetActorsId4Room(parentAdapter.config.rooms[room].name);
                const thermostats = await GetThermostatId4Room(parentAdapter.config.rooms[room].name);

                let HasActorsWithoutThermostat = false;
                if (actors.length > 0 && thermostats.length == 0) {
                    HasActorsWithoutThermostat = true;

                    for (let d = 0; d < actors.length; d++) {
                        ActorsWithoutThermostat.push({
                            name: actors[d].name,
                            id: actors[d].id,
                            room: parentAdapter.config.rooms[room].name
                        });
                    }
                }

                Rooms.push({
                    ID: room,
                    Name: parentAdapter.config.rooms[room].name,
                    isActive: true,                       // standard: always active, possible to disable with DP 
                    WindowIsOpen: false,                    //heatingcontrol.0.Rooms.Büro.WindowIsOpen
                    WindowIsOpenChanged: "never",
                    TemperaturOverrideTime: "00:00",        //heatingcontrol.0.Rooms.Büro.TemperaturOverrideTime
                    TemperaturOverride: 0,                  //heatingcontrol.0.Rooms.Büro.TemperaturOverride
                    State: "starting",                      //heatingcontrol.0.Rooms.Büro.State
                    PreviousState: "none",
                    CurrentTimePeriodTime: "00:00",         //heatingcontrol.0.Rooms.Büro.CurrentTimePeriodTime
                    CurrentTimePeriodFull: "",              //heatingcontrol.0.Rooms.Büro.CurrentTimePeriodFull
                    CurrentTimePeriod: -1,                  //heatingcontrol.0.Rooms.Büro.CurrentTimePeriod
                    CurrentTarget: -99,                     //heatingcontrol.0.Rooms.Büro.CurrentTarget
                    CurrentReduced: 0,
                    ActiveTimeSlot: -1,                     //heatingcontrol.0.Rooms.Büro.ActiveTimeSlot
                    MinimumTemperature: -99,                //heatingcontrol.0.vis.RoomValues.MinimumTemperature
                    CurrentProfileTarget: -99,   // target according profile, used to disable ManuMode
                    LastAutoTarget: -99,
                    IsInOverride: false,        // override active
                    IsInReduced: false,         // somehow reduced or increased
                    CurrentReducedMode: "none",
                    IsInManual: false,          // target used from thermostat
                    TemperatureManualMode: -99,
                    CurrentTemperature: -99,
                    CurrentTemperatureAddSensor: -99,
                    ReducedState: "",
                    HasActorsWithoutThermostat: HasActorsWithoutThermostat,
                    //see issue #265 and #305
                    //WindowCloseTimerId: null,
                    //WindowOpenTimerId: null,
                    Present: true,
                    VacationAbsent: false,
                    MaintenanceActive: false,
                    PowerInterruptionPeriodActive: false,
                    FireplaceModeActive: false,
                    HolidayPresent: false,
                    GuestsPresent: false,
                    PartyNow: false,
                    PublicHolidyToday: false,
                    OverrideTimerId: null,
                    HeatingPeriod: true,
                    StatusLog: [],
                    hasWindowSensors: (sensors.length > 0 ? true : false),
                    ActorState: false,
                    NextTemperaturFromThermostatIsWindowOpen: false,  //used to identify Temperatur from thermostat as a WindowOpenTemperature
                    WindowOpenUntilTemperaturTimerId: null,
                    sensors: sensors,
                    TempOffset: 0, // to correct current temperatur from thermostat with a additional sensor
                    hasAddTempSensors: (addTempSensors.length > 0 ? true : false),
                    TempOffsetData: [],
                    RemainingOverrideTime: 0,
                    RemainingOverrideTimerId: null,
                    WaitForTempIfWindowOpen: parentAdapter.config.rooms[room].WaitForTempIfWindowOpen,     //time to wait for temperature update from thermostat when thermostat handles WindowIsOpen
                    TemperatureIfNoHeatingPeriod: -99
                });

                //test only
                //parentAdapter.log.warn("WaitForTempIfWindowOpen: " + parentAdapter.config.rooms[room].WaitForTempIfWindowOpen);
            }
        }




        if (Rooms.length > 0) {
            parentAdapter.log.debug("CreateDatabase: " + Rooms.length + " active rooms found " + JSON.stringify(Rooms));
        } else {
            parentAdapter.log.warn("CreateDatabase: none active rooms found! " + JSON.stringify(Rooms));
        }
        parentAdapter.log.debug("CreateDatabase: " + Sensors.length + " active sensors found " + JSON.stringify(Sensors));
        parentAdapter.log.debug("CreateDatabase: " + Actors.length + " active actors found " + JSON.stringify(Actors));
        if (Thermostats.length > 0) {
            parentAdapter.log.debug("CreateDatabase: " + Thermostats.length + " active thermostats found " + JSON.stringify(Thermostats));
        } else {
            parentAdapter.log.warn("CreateDatabase: none active thermostats found! " + JSON.stringify(Thermostats));
        }
        parentAdapter.log.debug("CreateDatabase: " + AddTempSensors.length + " active additional Temp sensors found " + JSON.stringify(AddTempSensors));

        if (parentAdapter.config.UseActors) {
            parentAdapter.log.debug("starting regulator");
            regulator_start(parentAdapter);
        }
        StartActors(parentAdapter, ErrorLog);


    } catch (e) {
        parentAdapter.log.error("exception in CreateDatabase [" + e + "]");
    }

    parentAdapter.log.info("CreateDatabase done with " + Rooms.length + " rooms");
}

async function GetSensorsId4Room( room) {

    const sensors = [];
    if (parentAdapter.config.UseSensors) {
        const devices = findObjectsByKey(parentAdapter.config.devices, "room", room);

        if (devices !== null) {

            for (let d = 0; d < devices.length; d++) {

                if (devices[d].type == 3 && devices[d].isActive) {

                    let DataType = "boolean";
                    let valueOpen = true;
                    let valueClosed = false;

                    if (devices[d].DataType !== undefined && devices[d].DataType != null) {
                        DataType = devices[d].DataType;
                        valueOpen = devices[d].valueOpen;
                        valueClosed = devices[d].valueClosed;
                    } else {
                        parentAdapter.log.warn("window sensor has no datatyp in " + room + " (" + devices[d].name + "), boolean used. Please check and save configuration");
                    }

                    Sensors.push({
                        name: devices[d].name,
                        room: room,
                        OID: devices[d].OID_Current,
                        lastState: false,
                        lastChange: "",
                        DataType: DataType,
                        valueOpen: valueOpen,
                        valueClosed: valueClosed,
                        //see issue #265 and #305
                        WindowCloseTimerId: null,
                        WindowOpenTimerId: null,
                    });

                    sensors.push({
                        name: devices[d].name,
                        id: Sensors.length - 1,
                        OID: devices[d].OID_Current,
                        DataType: DataType,
                        valueOpen: valueOpen,
                        valueClosed: valueClosed,
                        state: -1
                    });
                }
            }
        }
    }

    //adapter.log.debug("got sensors for " + room + "" + JSON.stringify(sensors) + " " + JSON.stringify(Sensors));


    return sensors;
}

async function GetAddTempSensorsId4Room(room) {

    const sensors = [];
    if (parentAdapter.config.UseAddTempSensors) {
        const devices = findObjectsByKey(parentAdapter.config.devices, "room", room);

        if (devices !== null) {

            for (let d = 0; d < devices.length; d++) {

                if (devices[d].type == 4 && devices[d].isActive) {

                    AddTempSensors.push({
                        name: devices[d].name,
                        room: room,
                        OID: devices[d].OID_Current,
                        lastState: false,
                        lastChange: ""
                    });

                    sensors.push({
                        name: devices[d].name,
                        id: Sensors.length - 1,
                        OID: devices[d].OID_Current
                    });
                }
            }
        }
    }

    //adapter.log.debug("got sensors for " + room + "" + JSON.stringify(sensors) + " " + JSON.stringify(Sensors));


    return sensors;
}

async function GetActorsId4Room( room) {

    const actors = [];
    if (parentAdapter.config.UseActors) {
        const devices = findObjectsByKey(parentAdapter.config.devices, "room", room);

        if (devices !== null) {

            for (let d = 0; d < devices.length; d++) {

                if (devices[d].type == 2 && devices[d].isActive) {

                    Actors.push({
                        name: devices[d].name,
                        room: room,
                        OID: devices[d].OID_Target,
                        lastState: false,
                        lastChange: "",
                        ActorOnTimerId: null,
                        ActorOffTimerId: null,

                        //for extended actor handling
                        useExtHandling: devices[d].useExtHandling,
                        reptime: parentAdapter.config.ExtHandlingActorRepTime,
                        ackwait: parentAdapter.config.ExtHandlingActorAckWaitTime,
                        ExtSetTimerId: null,
                        SetCnt: 0

                    });

                    actors.push({
                        name: devices[d].name,
                        id: Actors.length - 1
                    });
                }
            }
        }
    }

    //adapter.log.debug("got actors for " + room + "" + JSON.stringify(actors) + " " + JSON.stringify(Actors));
    return actors;
}

async function GetThermostatId4Room( room) {
    const thermostats = [];

    const devices = findObjectsByKey(parentAdapter.config.devices, "room", room);

    if (devices !== null) {

        for (let d = 0; d < devices.length; d++) {

            if (devices[d].type == 1 && devices[d].isActive) {

                Thermostats.push({
                    name: devices[d].name,
                    room: room,
                    OID_Target: devices[d].OID_Target,
                    OID_Current: devices[d].OID_Current,
                    lastTarget: -99,
                    currentTarget: -99,
                    lastTargetFromDevice: -99,
                    lastChange: "",
                    SetTimerId: null,

                    //for extended actor handling
                    useExtHandling: devices[d].useExtHandling,
                    reptime: parentAdapter.config.ExtHandlingThermostatRepTime,
                    ackwait: parentAdapter.config.ExtHandlingThermostatAckWaitTime,
                    ExtSetTimerId: null,
                    SetCnt: 0
                });

                thermostats.push({
                    name: devices[d].name,
                    id: Thermostats.length - 1
                });
            }
        }
    }

    //parentAdapter.log.debug("got thermostats for " + room + "" + JSON.stringify(thermostats) + " " + JSON.stringify(Thermostats));
    return thermostats;
}

//*******************************************************************
//
function GetUsedRooms() {

    let UsedRooms = "";

    for (let room = 0; room < Rooms.length; room++) {
        UsedRooms += Rooms[room].Name;
        UsedRooms += ";";
    }

    if (UsedRooms != null && UsedRooms.length > 0) {
        //remove last ;
        UsedRooms = UsedRooms.slice(0, -1);
    }

    return UsedRooms;
}

//*******************************************************************
//
let alreadyChanging = false;
const ChangeStatusCmdList = [];
const MaxCmdList = 100;

async function ChangeStatus(state, room, value) {

    if (alreadyChanging) {

        if (ChangeStatusCmdList.length < MaxCmdList) {

            ChangeStatusCmdList.push(
                {
                    state: state,
                    room: room,
                    value: value
                }
            );
            parentAdapter.log.debug("ChangeStatus called, while already changing, push to list " + room + " " + state + " " + JSON.stringify(value) + " (" + ChangeStatusCmdList.length + ")");
        } else {
            parentAdapter.log.error("ChangeStatusCmdList is longer then " + MaxCmdList + " entries, no new entry allowed -> skipped " + room + " " + state + " " + JSON.stringify(value));
        }
        return;
    }
    //only one change call is allowed, put other in a list
    alreadyChanging = true;
    if (room == "all") {
        for (room = 0; room < Rooms.length; room++) {
            await ChangeStatus_Part2(state, Rooms[room].Name, value);
        }
    } else {
        await ChangeStatus_Part2(state, room, value);
    }
    alreadyChanging = false;

    if (ChangeStatusCmdList.length > 0) {
        const cmd = ChangeStatusCmdList.shift();
        parentAdapter.log.debug("ChangeStatus recall cmd from list " + cmd.room + " " + cmd.state + " " + JSON.stringify(cmd.value) + " (" + ChangeStatusCmdList.length + ")");
        await ChangeStatus(cmd.state, cmd.room, cmd.value);

    }
}

async function ChangeStatus_Part2(state, room, value) {

    try {
        const theRoom = findObjectByKey(Rooms, "Name", room);

        let val;
        if (value != null) {
            if (typeof value == "object") {
                val = value.val;
            } else {
                val = value;
            }
        }
        let changed = false;
        let handleActors = false;
        if (theRoom != null) {

            parentAdapter.log.debug(theRoom.Name + " ### ChangeStatus " + state + " to " + JSON.stringify(value) + " in " + theRoom.State);

            if (state == "isActive") {
                theRoom.isActive = value;
                if (!theRoom.isActive) {

                    //see issue #332: deactivate override before deactivate heating
                    if (theRoom.OverrideTimerId != null) {
                        clearTimeout(room.OverrideTimerId);
                        room.OverrideTimerId = null;
                    }

                    SetNewRoomState(theRoom, "no heating");
                    changed = true;
                } else if (theRoom.State == "no heating") {
                    SetNewRoomState(theRoom, "auto");
                    changed = true;
                }
            } else if (state == "Sensor") {
                //erst in SensorListe des Raumes eintragen und dann neues WindowIsOpen prüfen
                const newVal = AddSensorState(theRoom, value);

                if (theRoom.WindowIsOpen != newVal) {

                    WindowLog(theRoom.Name, newVal);

                    theRoom.WindowIsOpen = newVal;

                    theRoom.WindowIsOpenChanged = timeConverter(SystemLanguage, null);

                    //Pittini vis
                    if (parentAdapter.config.UseVisFromPittini) {
                        await CreateWindowStatesTable();
                    }

                    //======================================================
                    //special behavior for Thermostats which handles window open
                    if (parentAdapter.config.ThermostatHandlesWindowOpen) {
                        if (theRoom.WindowIsOpen) {

                            parentAdapter.log.debug(theRoom.Name + " NextTemperaturFromThermostatIsWindowOpen start timer");

                            //if window is opened wait for reduced target temperature from thermostat (max. 10 seconds) 
                            theRoom.NextTemperaturFromThermostatIsWindowOpen = true;

                            if (theRoom.WindowOpenUntilTemperaturTimerId != null) {
                                //cancel and restart
                                clearTimeout(room.WindowOpenUntilTemperaturTimerId);
                                theRoom.WindowOpenUntilTemperaturTimerId = null;
                            }

                            let WaitForTempIfWindowOpen = 10000; //default 10 sek
                            if (theRoom.WaitForTempIfWindowOpen !== undefined && theRoom.WaitForTempIfWindowOpen > 0) {
                                WaitForTempIfWindowOpen = theRoom.WaitForTempIfWindowOpen * 1000;
                            }

                            //braucht es das wirklich? ohne würden Änderungen vom Thermostat ignoriert werden, solange das Fenster auf ist
                            theRoom.WindowOpenUntilTemperaturTimerId = setTimeout(WindowOpenUntilTemperaturTimeout, WaitForTempIfWindowOpen, theRoom.Name);
                        } else {
                            //if window is closed, set back to auto mode (but only when window is open, ignore it if other reduced states are active)
                            if (theRoom.ReducedState == "WindowOpen") {

                                parentAdapter.log.debug(theRoom.Name + " NextTemperaturFromThermostatIsWindowOpen stop timer");

                                //see issue #347: andernfalls kommen alle anderen Änderungen vom Thermostat als auto WindowOpen
                                theRoom.NextTemperaturFromThermostatIsWindowOpen = false;

                                theRoom.ReducedState = "";
                                theRoom.IsInReduced = false;
                                theRoom.CurrentTarget = theRoom.CurrentProfileTarget;
                            }

                        }
                    }
                    //======================================================

                    changed = true;
                }
            } else if (state == "AddTempSensor") {
                await CalculateTempOffset(theRoom, value);

                if (parentAdapter.config.AddTempSensorsUseEveryOffsetChange) {
                    parentAdapter.log.debug(theRoom.Name + " offset calc done, use new offset ");
                    changed = true;
                    handleActors = true;
                }

            } else if (state == "TemperatureOffset") {
                //ChangeStatus not implemented yet TemperatureOffset Wohnzimmer value 22
                theRoom.TempOffset = value;
            } else if (state == "Thermostats_Current") {
                parentAdapter.log.debug("Change Status current temperature in " + theRoom.Name + " to " + val);
                theRoom.CurrentTemperature = val;
                handleActors = true;

            } else if (state == "Thermostats_Target") {
                parentAdapter.log.debug("Change Status target temperature in " + theRoom.Name + " to " + val + " (profile " + theRoom.CurrentProfileTarget + ") in " + theRoom.State);

                if (theRoom.State != "starting") {
                    const result = await CheckManualMode(theRoom, val);
                    changed = result.changed;
                    handleActors = result.handleActors;
                }
            } else if (state == "ResetManual") {
                parentAdapter.log.debug("ChangeStatus ResetManual");

                //see issue #355 manche verwenden den Button um override zu beenden
                //wird hier aber gar nicht behandelt???
                if (theRoom.IsInOverride) {
                    parentAdapter.log.debug("StopOverride in ResetManual");
                    theRoom.IsInOverride = false;
                    theRoom.overrideTemp = 0;
                }
                theRoom.State = "auto";
                changed = true;
            } else if (state == "Profiles" || state == "CurrentProfile") {
                parentAdapter.log.debug("ChangeStatus Profile or CurrentProfile");

                if (theRoom.State != "starting") {
                    const currentProfile = await GetCurrentProfile();

                    await CreateCronJobs(parentAdapter, currentProfile, ChangeStatus, Rooms);

                    //aktuellen Profilpunkt setzen
                    await GetCurrentProfilePoint(theRoom, currentProfile);
                }
                changed = true;
            } else if (state == "TemperaturOverride" || state == "TemperaturOverrideTime") {
                parentAdapter.log.debug("ChangeStatus Override ");
                if (theRoom.State != "starting") {
                    await CheckOverride(theRoom);
                }
                changed = true;
            } else if (state == "StopOveride") {
                parentAdapter.log.debug("ChangeStatus StopOverride ");
                theRoom.IsInOverride = false;
                theRoom.overrideTemp = 0;
                theRoom.State = "auto";
                changed = true;
            } else if (state == "ProfilPoint") {
                if (value.target !== undefined && !isNaN(value.target)) { //this comes from cron job
                    if (parseInt(parentAdapter.config.OverrideMode) === 2) {

                        if (theRoom.IsInOverride) {
                            parentAdapter.log.debug(theRoom.Name + " new profile point, but still in override: need to stop override first");
                            theRoom.IsInOverride = false;
                            theRoom.overrideTemp = 0;
                            theRoom.State = "auto";
                        }
                    }

                    theRoom.CurrentProfileTarget = Check4ValidTemperature(parentAdapter, value.target);
                    theRoom.CurrentTimePeriod = value.currentTimePeriod;
                    theRoom.ActiveTimeSlot = value.ActiveTimeSlot;
                    theRoom.CurrentTimePeriodTime = value.CurrentTimePeriodTime;
                    theRoom.CurrentTimePeriodFull = value.CurrentTimePeriodFull;

                    if (theRoom.State == "manual") {
                        theRoom.State = "auto";
                        parentAdapter.log.debug("reset manual mode to auto");
                    }

                    parentAdapter.log.debug("ChangeStatus by cron Profilepoint in " + theRoom.Name + " target " + theRoom.CurrentProfileTarget);
                    changed = true;
                } else if (val == -99) { //=-99 just triggers recalculation
                    parentAdapter.log.debug("ChangeStatus Profilepoint in " + theRoom.Name + " just recalc");
                    changed = true;
                } else {
                    //initial when adapter starts
                    parentAdapter.log.debug("ChangeStatus Profilepoint in " + theRoom.Name + " target " + val);
                    theRoom.CurrentProfileTarget = Check4ValidTemperature(parentAdapter, val);
                    changed = true;
                }
            } else if (state == "Present") {
                if (theRoom.Present != val) {
                    parentAdapter.log.debug("Change Status Present in " + theRoom.Name + " to " + val);
                    theRoom.Present = val;
                    changed = true;
                }
            } else if (state == "VacationAbsent") {
                if (theRoom.VacationAbsent != val) {
                    parentAdapter.log.debug("Change Status VacationAbsent in " + theRoom.Name + " to " + val);
                    theRoom.VacationAbsent = val;
                    changed = true;
                }
            } else if (state == "MaintenanceActive") {
                if (theRoom.MaintenanceActive != val) {
                    parentAdapter.log.debug("Change Status MaintenanceActive in " + theRoom.Name + " to " + val);
                    theRoom.MaintenanceActive = val;
                    changed = true;
                }
            } else if (state == "PowerInterruptionPeriodActive") {
                if (theRoom.PowerInterruptionPeriodActive != val) {
                    parentAdapter.log.debug("Change Status PowerInterruptionPeriodActive in " + theRoom.Name + " to " + val);
                    theRoom.PowerInterruptionPeriodActive = val;
                    changed = true;
                    if (theRoom.PowerInterruptionPeriodActive) {
                        SetNewRoomState(theRoom, "PowerInterruption");
                    }
                }
            } else if (state == "FireplaceModeActive") {
                if (theRoom.FireplaceModeActive != val) {
                    parentAdapter.log.debug("Change Status FireplaceModeActive in " + theRoom.Name + " to " + val);
                    theRoom.FireplaceModeActive = val;
                    changed = true;
                }
            } else if (state == "HolidayPresent") {
                if (theRoom.HolidayPresent != val) {
                    parentAdapter.log.debug("Change Status HolidayPresent in " + theRoom.Name + " to " + val);
                    theRoom.HolidayPresent = val;


                    //2024-02-25 warum beim starten nicht? wir brauchen die cron job Berechnung auch hier...
                    //if (theRoom.State != "starting") {
                    //Neuberechnung der Zeiten (cron) und damit Zieltemperaturen
                    const currentProfile = await GetCurrentProfile();
                    await CreateCronJobs(parentAdapter, currentProfile, ChangeStatus, Rooms);

                    //aktuellen Profilpunkt setzen
                    await GetCurrentProfilePoint(theRoom, currentProfile);
                    changed = true;
                    //}
                }
            } else if (state == "GuestsPresent") {
                if (theRoom.GuestsPresent != val) {
                    parentAdapter.log.debug("Change Status GuestsPresent in " + theRoom.Name + " to " + val);
                    theRoom.GuestsPresent = val;
                    changed = true;
                }
            } else if (state == "PartyNow") {
                if (theRoom.PartyNow != val) {
                    parentAdapter.log.debug("Change Status PartyNow in " + theRoom.Name + " to " + val);
                    theRoom.PartyNow = val;
                    changed = true;
                }
            } else if (state == "PublicHolidyToday") {
                if (theRoom.PublicHolidyToday != val) {
                    parentAdapter.log.info("Change Status PublicHolidyToday in " + theRoom.Name + " to " + val);
                    theRoom.PublicHolidyToday = val;

                    //2024-02-25 warum beim starten nicht? wir brauchen die cron job Berechnung auch hier...
                    //if (theRoom.State != "starting") {
                    //Neuberechnung der Zeiten (cron) und damit Zieltemperaturen
                    const currentProfile = await GetCurrentProfile();
                    await CreateCronJobs(parentAdapter, currentProfile, ChangeStatus, Rooms);

                    //aktuellen Profilpunkt setzen
                    await GetCurrentProfilePoint(theRoom, currentProfile);
                    changed = true;
                    //}
                }
            } else if (state == "HeatingPeriodActive") {
                if (theRoom.HeatingPeriod != val) {
                    parentAdapter.log.info("Change Status HeatingPeriodActive in " + theRoom.Name + " to " + val);
                    theRoom.HeatingPeriod = val;
                    changed = true;

                    if (theRoom.State != "starting") {
                        if (theRoom.HeatingPeriod) {
                            SetNewRoomState(theRoom, "auto");
                        } else {
                            SetNewRoomState(theRoom, "no heating");
                        }
                    }
                }
            } else if (state == "MinimumTemperature") {
                theRoom.MinimumTemperature = val;
            } else if (state == "TemperatureIfNoHeatingPeriod") {
                theRoom.TemperatureIfNoHeatingPeriod = val;
            } else {
                parentAdapter.log.error("!!ChangeStatus not implemented yet " + state + " " + theRoom.Name + " value " + JSON.stringify(value));
            }


            if (theRoom.State != "starting" && changed) {
                const temperature = await CalculateRoomTemperature(theRoom);
                await SetRoomTemperature(theRoom, temperature);
                handleActors = true;
            }

            if (theRoom.State != "starting" && handleActors) {
                await HandleActors(theRoom);
                await HandleActorsWithoutThermostat();
                await CheckAllActors();
            }
            await UpdateDPs(theRoom);
        } else {
            parentAdapter.log.warn("ChangeStatus: room " + room + " not found");
        }

    } catch (e) {
        parentAdapter.log.error("exception in ChangeStatus [" + e + "] " + state + " in " + room + " " + JSON.stringify(value));
    }
}



async function GetTarget4NoHeatingPeriod(room) {

    let temp2Set = -99;

    if (parentAdapter.config.ThermostatModeIfNoHeatingperiod == 1) {
        const id = "Rooms." + room.Name + ".TemperatureIfNoHeatingPeriod";
        const TargetTemp = await parentAdapter.getStateAsync(id);

        if (TargetTemp != null && typeof TargetTemp == "object") {
            parentAdapter.log.debug("set target (1) if no heating for room " + room.Name + " to " + TargetTemp.val);

            temp2Set = TargetTemp.val;

        } else {
            parentAdapter.log.error("target temperature for no heating period is not set for " + room.Name);
        }

    } else if (parentAdapter.config.ThermostatModeIfNoHeatingperiod == 2) {
        const TargetTemp = parseFloat(parentAdapter.config.FixTempIfNoHeatingPeriod);
        parentAdapter.log.debug("set target (2) if no heating for room " + room.Name + " to " + TargetTemp);
        temp2Set = TargetTemp;
    } else {
        parentAdapter.log.debug("do not set target if no heating for room " + room.Name);
    }

    return temp2Set;
}




async function CalculateRoomTemperature(room) {

    parentAdapter.log.debug("CalculateRoomTemperature for " + room.Name + " " + room.State + " " + room.WindowIsOpen);

    let Temp2Set = -99;
    room.IsInReduced = false;

    //rücksetzen ...
    if (room.State == "Maintenance" && !room.MaintenanceActive) {
        SetNewRoomState(room, room.PreviousState);
    }
    //else //kein else!!
    if (room.MaintenanceActive) {
        SetNewRoomState(room, "Maintenance");
        Temp2Set = parentAdapter.config.MaintenanceModeTemperature;
    }    else if (room.State == "no heating" || !room.HeatingPeriod) {
        if (room.State != "no heating") {
            SetNewRoomState(room, "no heating");
        }
        Temp2Set = await GetTarget4NoHeatingPeriod(room);
    }    else if (room.State == "auto" || room.State == "PowerInterruption") {
        Temp2Set = room.CurrentProfileTarget;

        parentAdapter.log.debug(room.Name + " auto mode: target " + Temp2Set);


        if (room.WindowIsOpen) {

            if (!parentAdapter.config.ThermostatHandlesWindowOpen) {
                const preTemp2Set = await GetReducedTemperature(room.Name, "WindowOpenDecrease");
                if (preTemp2Set.target != 0 && preTemp2Set.decreaseMode != "none") {
                    room.CurrentReducedMode = preTemp2Set.decreaseMode;
                    if (preTemp2Set.decreaseMode == "rel") {
                        Temp2Set -= preTemp2Set.target;
                        room.CurrentReduced = -1 * preTemp2Set.target;
                    } else {
                        Temp2Set = preTemp2Set.target;
                    }
                    room.ReducedState = "WindowOpen";
                    room.IsInReduced = true;
                }
            } else {
                parentAdapter.log.debug(room.Name + " we are in ThermostatHandlesWindowOpen");
                room.ReducedState = "WindowOpen";
                room.IsInReduced = true;

                Temp2Set = await GetCurrentTarget(room);
            }

        }


        //Reihenfolge nochmal prüfen?

        //see issue #285 absent and VacationAbsent exchanged
        if (!room.IsInReduced && room.VacationAbsent) {
            const preTemp2Set = await GetReducedTemperature(room.Name, "VacationAbsentDecrease");
            if (preTemp2Set.target != 0 && preTemp2Set.decreaseMode != "none") {
                room.CurrentReducedMode = preTemp2Set.decreaseMode;
                if (preTemp2Set.decreaseMode == "rel") {
                    Temp2Set -= preTemp2Set.target;
                    room.CurrentReduced = -1 * preTemp2Set.target;
                } else {
                    Temp2Set = preTemp2Set.target;
                }
                room.ReducedState = "VacationAbsent";
                room.IsInReduced = true;
            }
        }

        if (!room.IsInReduced && !room.Present) {
            const preTemp2Set = await GetReducedTemperature(room.Name, "AbsentDecrease");
            if (preTemp2Set.target != 0 && preTemp2Set.decreaseMode != "none") {
                room.CurrentReducedMode = preTemp2Set.decreaseMode;
                if (preTemp2Set.decreaseMode == "rel") {
                    Temp2Set -= preTemp2Set.target;
                    room.CurrentReduced = -1 * preTemp2Set.target;
                } else {
                    Temp2Set = preTemp2Set.target;
                }
                room.ReducedState = "Absent";
                room.IsInReduced = true;
            }
        }
        

        if (!room.IsInReduced && room.GuestsPresent) {
            const preTemp2Set = await GetReducedTemperature(room.Name, "GuestIncrease");
            if (preTemp2Set.target != 0 && preTemp2Set.decreaseMode != "none") {
                room.CurrentReducedMode = preTemp2Set.decreaseMode;
                if (preTemp2Set.decreaseMode == "rel") {
                    Temp2Set += preTemp2Set.target;
                    room.CurrentReduced = preTemp2Set.target;
                } else {
                    Temp2Set = preTemp2Set.target;
                }
                room.ReducedState = "Guests";
                room.IsInReduced = true;
            }
        }
        if (!room.IsInReduced && room.PartyNow) {
            const preTemp2Set = await GetReducedTemperature(room.Name, "PartyDecrease");
            if (preTemp2Set.target != 0 && preTemp2Set.decreaseMode != "none") {
                room.CurrentReducedMode = preTemp2Set.decreaseMode;
                if (preTemp2Set.decreaseMode == "rel") {
                    Temp2Set -= preTemp2Set.target;
                    room.CurrentReduced = -1 * preTemp2Set.target;
                } else {
                    Temp2Set = preTemp2Set.target;
                }
                room.ReducedState = "Party";
                room.IsInReduced = true;
            }
        }

        if (!room.IsInReduced && room.FireplaceModeActive) {
            const preTemp2Set = await GetReducedTemperature(room.Name, "FireplaceModeDecrease");
            if (preTemp2Set.target != 0 && preTemp2Set.decreaseMode != "none") {
                room.CurrentReducedMode = preTemp2Set.decreaseMode;
                if (preTemp2Set.decreaseMode == "rel") {
                    Temp2Set -= preTemp2Set.target;
                    room.CurrentReduced = -1 * preTemp2Set.target;
                } else {
                    Temp2Set = preTemp2Set.target;
                }
                room.ReducedState = "FireplaceMode";
                room.IsInReduced = true;
            }
        }


        parentAdapter.log.debug(room.Name + " auto mode (incl. reduced): target " + Temp2Set);
        room.LastAutoTarget = Temp2Set;

    } else if (room.State == "override") {


        //Küche override mode(incl.reduced): target 11(window open false 11


        Temp2Set = room.TemperaturOverride;
        //in override only window sensor is checked
        if (room.WindowIsOpen) {
            const preTemp2Set = await GetReducedTemperature(room.Name, "WindowOpenDecrease");
            if (preTemp2Set.target != 0 && preTemp2Set.decreaseMode != "none") {
                room.CurrentReducedMode = preTemp2Set.decreaseMode;
                if (preTemp2Set.decreaseMode == "rel") {
                    Temp2Set -= preTemp2Set.target;
                    room.CurrentReduced = -1 * preTemp2Set.target;
                } else {
                    Temp2Set = preTemp2Set.target;
                }
                room.ReducedState = "WindowOpen";
                room.IsInReduced = true;
            }
        }

        parentAdapter.log.debug(room.Name + " override mode (incl. reduced): target " + Temp2Set + " ( window open " + room.WindowIsOpen + " " + room.TemperaturOverride +")");
    } else if (room.State == "manual") {

        Temp2Set = room.TemperatureManualMode;
        parentAdapter.log.debug(room.Name + " CalculateRoomTemperature for manual " + Temp2Set);


        //in manual mode check only window sensors
        
        if (room.WindowIsOpen) {
            const preTemp2Set = await GetReducedTemperature(room.Name, "WindowOpenDecrease");
            if (preTemp2Set.target != 0 && preTemp2Set.decreaseMode != "none") {
                room.CurrentReducedMode = preTemp2Set.decreaseMode;
                if (preTemp2Set.decreaseMode == "rel") {
                    Temp2Set -= preTemp2Set.target;
                    room.CurrentReduced = -1 * preTemp2Set.target;

                    room.ReducedState = "WindowOpen";
                    room.IsInReduced = true;
                } else {

                    //irgendetwas war da, warum ich das nicht so wollte???

                    Temp2Set = preTemp2Set.target;
                    room.CurrentReduced = -1 * preTemp2Set.target;

                    room.ReducedState = "WindowOpen";
                    room.IsInReduced = true;
                }

                
            }
        }
        
    } else if (room.State == "starting") {

        //do nothing
    } else {
        parentAdapter.log.warn(room.Name + " not supported room state " + room.State);

    }

    if (Temp2Set > -99) {
        Temp2Set = await CheckMinTemp(room.Name, Temp2Set);
    }
    return Temp2Set;


}

async function GetReducedTemperature(room, parameter) {

    let decreaseMode = "none";
    let target = 0;
    try {

        const currentProfile = await GetCurrentProfile();
        let id = "Profiles." + currentProfile + "." + room;
        if (parseInt(parentAdapter.config.TemperatureDecrease) === 1) {// relative
            id += ".relative";
            decreaseMode = "rel";
        } else if (parseInt(parentAdapter.config.TemperatureDecrease) === 2) {// absolutue
            id += ".absolute";
            decreaseMode = "abs";
        }

        if (decreaseMode != "none") {
            id += "." + parameter;

            parentAdapter.log.debug("checking reduced temp with " + id);

            const reducedTemp = await parentAdapter.getStateAsync(id);
            parentAdapter.log.debug(parameter + " got " + JSON.stringify(reducedTemp));

            if ( reducedTemp !== undefined && reducedTemp !== null && reducedTemp.val !== null) {

                target = reducedTemp.val;
                /*
                if (parseInt(parentAdapter.config.TemperatureDecrease) === 1) {// relative
                    target -= reducedTemp.val;
                }
                else if (parseInt(parentAdapter.config.TemperatureDecrease) === 2) {// absolutue
                    target = reducedTemp.val;
                }
                */
            }
        }
    } catch (e) {
        parentAdapter.log.error("exception in GetReducedTemperature [" + e + "]");
    }

    const ret = {
        decreaseMode: decreaseMode,
        target: target
    };

    return ret;
}

async function CheckMinTemp(room, target) {

    try {
        if (parentAdapter.config.UseMinTempPerRoom) {

            //hier könnte man direkt auf room.MinimumTemperature zugreifen, beim start müsste es aber gelesen werden
            const id = "Rooms." + room + ".MinimumTemperature";

            parentAdapter.log.debug("checking min temp with " + id);
            const minTemp = await parentAdapter.getStateAsync(id);
            parentAdapter.log.debug("got " + JSON.stringify(minTemp));

            if ( minTemp !== undefined && minTemp !== null && minTemp.val !== null && target < minTemp.val) {
                parentAdapter.log.info("target " + target + " lower then minimum " + minTemp.val + " : setting to min");
                target = minTemp.val;
            }
        }
    } catch (e) {
        parentAdapter.log.error("exception in CheckMinTemp [" + e + "]");
    }
    return target;
}

//*******************************************************************
//

async function CheckManualMode(room, target) {
    let changed = false;
    let handleActors = false;

    parentAdapter.log.debug("CheckManualMode " + room.Name + " target " + target + " current manual target " + room.TemperatureManualMode + " state " + room.State);

    if (room.State == "auto") {

        //this is a special behavior: Thermostat itself handles window open, but new temperatur from thermostat should not be handled as manual
        if (parentAdapter.config.ThermostatHandlesWindowOpen && room.NextTemperaturFromThermostatIsWindowOpen) {
            if (room.CurrentTarget != target) {
                parentAdapter.log.debug("temperature from thermostat while window is open " + room.Name + " with " + target);

                room.CurrentTarget = target;
                room.ReducedState = "WindowOpen";
                room.IsInReduced = true;
                handleActors = true;
            }
        } else {
            await CheckStartManualMode(room, target);
            if (room.State != "auto") {
                changed = true;
            }
        }
    } else if (room.State == "manual") {

        if (room.TemperatureManualMode != target) {

            if (room.IsInReduced) {
                parentAdapter.log.warn(room.Name + " manual mode " + target + " but ignored because already reduced");
            } else {

                room.TemperatureManualMode = target;
                parentAdapter.log.debug(room.Name + " manual mode changed to  " + room.TemperatureManualMode);
                changed = true;
            }
        }

    } else if (room.State == "override") {

        if (room.IsInReduced) {
            //das verhindert das Umschalten des Override auf die reduzierte Temp, welche vom Thermostat kommt, dadurch wäre ein zurückschalten auf 
            //override Temp nach Schliessen des Fensters nicht möglich (siehe auch oben im manual mode)
            parentAdapter.log.warn(room.Name + " override mode " + target + " but ignored because already reduced");
        } else {
            parentAdapter.log.debug(room.Name + " change override to " + target);
            //see issue #268 Version 2.6.2 triggert nicht auf Änderungen am Thermostat
            //change override needed
            //just set override temperature, everything else is handled as standard override
            const id = "Rooms." + room.Name;
            await parentAdapter.setStateAsync(id + ".TemperaturOverride", target);
        }
    }

    //we do not set back automatically
    /*
    else {
        if (room.State == "manual") {
            await CheckStopManualMode(room, target);
            if (room.State != "manual") {
                changed = true;
            }
        }
    }
    */

    const result = {
        changed: changed,
        handleActors: handleActors
    };


    return result;
}
async function CheckStartManualMode(room, target) {

    parentAdapter.log.debug("CheckStartManualMode " + room.Name);

    if (room.CurrentTarget != target) {
        parentAdapter.log.debug("CheckStartManualMode: current target " + room.CurrentTarget + " new " + target);

        await CheckTargetFromThermostat(room, target);
    }

/*
    //standard fall: nicht reduziert und in auto-Modus
    //if (room.CurrentProfileTarget != target && !room.IsInReduced) {
    //standard fall:  in auto-Modus
    if (room.CurrentProfileTarget != target) {

        if (room.IsInOverride) {
            parentAdapter.log.warn("#### 111 CurrentTarget " + room.CurrentTarget + " CurrentReduced " + room.CurrentReduced + " CurrentProfileTarget " + room.CurrentProfileTarget);
        }
        else if (room.IsInReduced) {
            parentAdapter.log.warn("#### 222 CurrentTarget " + room.CurrentTarget + " CurrentReduced " + room.CurrentReduced + " CurrentProfileTarget " + room.CurrentProfileTarget);
            //#### 222 CurrentTarget 24 CurrentReduced 2 CurrentProfileTarget 22
            const temp = room.CurrentProfileTarget + room.CurrentReduced;
            if (temp != target) {
                parentAdapter.log.warn("#### 222 222 should check " + temp + " " + target);
                await CheckTargetFromThermostat(room, target);
            }
            else {
                parentAdapter.log.warn("#### 222 222 ignore it " + temp + " " + target);
            }
        }
        else {
            await CheckTargetFromThermostat(room, target);
        }
    }
    else {
        parentAdapter.log.error("CheckStartManualMode not handled " + room.CurrentProfileTarget + " " + target + " " + room.IsInReduced);
    }
*/
}

/*
async function CheckStopManualMode(room, target) {
    parentAdapter.log.warn("CheckStopManualMode called");
    
    if (room.LastAutoTarget == target) {
        parentAdapter.log.info("Change Status reset manual mode in " + room.Name + " " + room.State);
        room.State = "auto";
    }
    else {
        parentAdapter.log.error("CheckStopManualMode not handled " + room.LastAutoTarget + " " + target);
    }
}
*/


async function CheckTargetFromThermostat(room, target) {
    parentAdapter.log.debug("CheckTargetFromThermostat " + room.Name);

    if (parseInt(parentAdapter.config.UseChangesFromThermostat) == 2) {
        parentAdapter.log.debug(room.Name + " got target from thermostat as override: " + target);

        //just set override temperature, everything else is handled as standard override
        const id = "Rooms." + room.Name;
        await parentAdapter.setStateAsync(id + ".TemperaturOverride", target);

        //should not update DP's because then new temperature will be set to 0

    } else if (parseInt(parentAdapter.config.UseChangesFromThermostat) == 3) {
        parentAdapter.log.debug(room.Name + " got target from thermostat as new profil point: " + target);

        await SetNewTarget4Profilpoint(room, target);

        //see issue #337: set new profile value to all thermostats
        const currentProfile = await GetCurrentProfile();
        //aktuellen Profilpunkt setzen
        await GetCurrentProfilePoint(room, currentProfile);

    } else if (parseInt(parentAdapter.config.UseChangesFromThermostat) == 5) {
        parentAdapter.log.debug(room.Name + " got target from thermostat until next profil point: " + target);
        room.State = "manual";
        

        room.TemperatureManualMode = target;
        parentAdapter.log.debug(room.Name + " manual mode  " + room.TemperatureManualMode);
    } else {
        parentAdapter.log.error("CheckTargetFromThermostat not handled, " + parseInt(parentAdapter.config.UseChangesFromThermostat));
    }
}

//*******************************************************************
//
async function SetNewTarget4Profilpoint(room, target) {
    parentAdapter.log.debug("start SetNewTarget4Profilpoint " + room.CurrentTimePeriod + " / " + room.ActiveTimeSlot + " " + parentAdapter.config.ProfileType);

    try {
        let id = "";
        let profilePart = "";
        const currentProfile = await GetCurrentProfile();

        //State "                 Profiles.1.Wohnzimmer.Mo-Fr.Periods.4.Temperature" has no existing object, this might lead to an error in future versions
        //       heatingcontrol.0.Profiles.1.Wohnzimmer.Mo-Fr.Periods.4.Temperature

        if (parseInt(parentAdapter.config.ProfileType, 10) === 1) {
            //Profiles.1.Küche.Mo-Su.Periods.1.Temperature
            profilePart = "Mo-Su";
            id = "Profiles." + currentProfile + "." + room.Name + "." + profilePart + ".Periods." + room.ActiveTimeSlot + ".Temperature";
        } else if (parseInt(parentAdapter.config.ProfileType, 10) === 2) {
            //Profiles.1.Wohnzimmer.Mo-Fr.Periods.1.Temperature
            const now = new Date();
            const day = now.getDay();
            let profilePart = "";
            if (day > 0 && day < 6) {
                profilePart = "Mo-Fr";
            } else {
                profilePart = "Sa-Su";
            }

            if (profilePart == "Mo-Fr" && room.PublicHolidyToday && parentAdapter.config.PublicHolidayLikeSunday === true) {
                profilePart = "Sa-Su";
                parentAdapter.log.debug("week end profile used for public holiday");
            } else if (profilePart == "Mo-Fr" && room.HolidayPresent && parentAdapter.config.HolidayPresentLikeSunday === true) {
                profilePart = "Sa-Su";
                parentAdapter.log.debug("week end profile used for holiday at home");
            }
            id = "Profiles." + currentProfile + "." + room.Name + "." + profilePart + ".Periods." + room.ActiveTimeSlot + ".Temperature";

        } else if (parseInt(parentAdapter.config.ProfileType, 10) === 3) {
            //Profiles.1.Wohnzimmer.Mon.Periods.1.Temperature
            const now = new Date();
            const day = now.getDay();
            let profilePart = "";

            if (day == 1) {
                profilePart = "Mon";
            } else if (day == 2) {
                profilePart = "Tue";
            } else if (day == 3) {
                profilePart = "Wed";
            } else if (day == 4) {
                profilePart = "Thu";
            } else if (day == 5) {
                profilePart = "Fri";
            } else if (day == 6) {
                profilePart = "Sat";
            } else if (day == 0) {
                profilePart = "Sun";
            }

            if (room.PublicHolidyToday && parentAdapter.config.PublicHolidayLikeSunday === true) {
                profilePart = "Sun";
                parentAdapter.log.debug("sunday profile used for public holiday");
            } else if (room.HolidayPresent && parentAdapter.config.HolidayPresentLikeSunday === true) {
                profilePart = "Sun";
                parentAdapter.log.debug("sunday profile used for holiday at home");
            }
            id = "Profiles." + currentProfile + "." + room.Name + "." + profilePart + ".Periods." + room.ActiveTimeSlot + ".Temperature";
        }

        if (id.length > 0) {
            parentAdapter.log.debug("SetNewTarget4Profilpoint id " + id + " to " + target);
            await parentAdapter.setStateAsync(id, { ack: false, val: target });
        } else {
            parentAdapter.log.error("SetNewTarget4Profilpoint id not found " + JSON.stringify(room) + " " + parseInt(parentAdapter.config.ProfileType, 10));
        }
    } catch (e) {
        parentAdapter.log.error("exception in SetNewTarget4Profilpoint [" + e + "] ");
    }
}


//*******************************************************************
//
async function CheckOverride(room) {

    const id = "Rooms." + room.Name;
    const overrideTemp = await parentAdapter.getStateAsync(id + ".TemperaturOverride");
    const overrideTime = await parentAdapter.getStateAsync(id + ".TemperaturOverrideTime");

    if (overrideTemp != null && overrideTime != null) {
        const temperature = Check4ValidTemperature(parentAdapter,overrideTemp.val);
        const time = CheckValidTime(parentAdapter,"override",overrideTime.val);

        const times = time.split(":");
        if (temperature > 0 && (parseInt(times[0]) > 0 || parseInt(times[1]) > 0)) {

            if (room.OverrideTimerId == null) {

                const hours = parseInt(times[0]);
                const minutes = parseInt(times[1]);
                let timeout = hours * 60 * 60 + minutes * 60;

                if (parseInt(parentAdapter.config.OverrideMode) != 1) {
                    timeout = 24 * 60 * 60; // until next profile point
                }

                parentAdapter.log.debug(room.Name + " start override for " + timeout + "sec");

                room.OverrideTimerId = setTimeout(OverrideTimeout, timeout * 1000, room.Name);

                room.State = "override";

                room.IsInOverride = true;
                room.TemperaturOverride = temperature;
                room.overrideTime = time;

                if (parseInt(parentAdapter.config.OverrideMode) === 1) {
                    room.RemainingOverrideTime = hours * 60 + minutes;
                    //do not wait here
                    parentAdapter.setState(id + ".TemperaturOverrideRemainingTime", { val: room.RemainingOverrideTime, ack: true });
                    if (parentAdapter.config.UseVisFromPittini) {
                        Vis_SetTemperaturOverrideRemainingTime(room.Name, room.RemainingOverrideTime);
                    }

                    //see #617: TemperaturOverrideRemainingTime wird zu schnell runter gezählt
                    if (room.RemainingOverrideTimerId != null) {
                        clearInterval(room.RemainingOverrideTimerId);
                        room.RemainingOverrideTimerId = null;
                        parentAdapter.log.debug(room.Name + " clear remaining override timer before start");
                    }

                    parentAdapter.log.debug(room.Name + " remaining override at start " + room.RemainingOverrideTime);

                    room.RemainingOverrideTimerId = setInterval(
                        function () {

                            room.RemainingOverrideTime--;
                            parentAdapter.log.debug(room.Name + " remaining override " + room.RemainingOverrideTime);

                            //do not wait here
                            parentAdapter.setState(id + ".TemperaturOverrideRemainingTime", { val: room.RemainingOverrideTime, ack: true });

                            if (parentAdapter.config.UseVisFromPittini) {
                                Vis_SetTemperaturOverrideRemainingTime(room.Name, room.RemainingOverrideTime);
                            }

                            if (room.RemainingOverrideTime <= 0) {
                                clearInterval(room.RemainingOverrideTimerId);
                                room.RemainingOverrideTime = 0;
                                room.RemainingOverrideTimerId = null;
                            }
                        }
                        , 1000 * 60
                    );
                }
            } else {
                //braucht es das? eher nicht?
                room.State = "override";
                room.IsInOverride = true;
                
                parentAdapter.log.debug(room.Name + " is already in override");

                //see issue 272: nur bei Änderung der Temperatur verlängern
                if (parentAdapter.config.ExtendOverride && room.TemperaturOverride != temperature) {
                    room.TemperaturOverride = temperature;
                    room.overrideTime = time;

                    clearTimeout(room.OverrideTimerId);
                    room.OverrideTimerId = null;

                    const hours = parseInt(times[0]);
                    const minutes = parseInt(times[1]);
                    const timeout = hours * 60 * 60 + minutes * 60;
                    parentAdapter.log.debug(room.Name + " restart override for " + timeout + "sec");
                    room.OverrideTimerId = setTimeout(OverrideTimeout, timeout * 1000, room.Name);
                } else {
                    parentAdapter.log.debug(room.Name + " override not restarted: " + parentAdapter.config.ExtendOverride + " " + room.TemperaturOverride + " " + temperature);
                }
            }
        } else {

            if (room.OverrideTimerId != null) {
                parentAdapter.log.debug(room.Name + " stop override");
                clearTimeout(room.OverrideTimerId);
                room.OverrideTimerId = null;
                room.RemainingOverrideTime = 0;

                parentAdapter.setState(id + ".TemperaturOverrideRemainingTime", { val: 0, ack: true });

                if (parentAdapter.config.UseVisFromPittini) {
                    Vis_SetTemperaturOverrideRemainingTime(room.Name, 0);
                }
            }

            parentAdapter.log.debug(room.Name + " reset to auto after override");
            room.State = "auto";

            room.IsInOverride = false;
            room.TemperaturOverride = 0;

            const temp = await parentAdapter.getStateAsync(id + ".TemperaturOverride");
            if (temp != null && temp.val != 0) {
                await parentAdapter.setStateAsync(id + ".TemperaturOverride", { val: 0, ack: true });
            }
        }
    }
}

async function WindowOpenUntilTemperaturTimeout(roomName) {

    parentAdapter.log.debug(roomName + " NextTemperaturFromThermostatIsWindowOpen timeout"); 

    try {
        const room = findObjectByKey(Rooms, "Name", roomName);
        if (room != null) {
            parentAdapter.log.debug("WindowOpenUntilTemperatur (finished) for " + room.Name);
            room.NextTemperaturFromThermostatIsWindowOpen = false;
        }
    } catch (e) {
        parentAdapter.log.error("exception in WindowOpenUntilTemperaturTimeout [" + e + "] " + roomName);
    }
}


async function OverrideTimeout(roomName) {

    try {
        const room = findObjectByKey(Rooms, "Name", roomName);
        if (room != null) {
            parentAdapter.log.debug("override timeout (finished) for " + room.Name);

            if (room.OverrideTimerId!=null) {
                clearTimeout(room.OverrideTimerId);
                room.OverrideTimerId = null;
            }

            await ChangeStatus("StopOveride", room.Name, true);
        }
    } catch (e) {
        parentAdapter.log.error("exception in OverrideTimeout [" + e + "] " + roomName);
    }
}

//*******************************************************************
//
async function GetCurrentProfile() {

    parentAdapter.log.debug("get current profile");
    let currentProfile = 1;

    try {
        const id = "CurrentProfile";
        const curProfile = await parentAdapter.getStateAsync(id);


        if (curProfile != null &&  curProfile !== undefined &&  curProfile.val !== undefined ) {
            currentProfile = curProfile.val;

            if (currentProfile < 1 || currentProfile > parseInt(parentAdapter.config.NumberOfProfiles, 10)) {
                currentProfile = 1;
            }
        } else {
            parentAdapter.log.error("current profile not valid " + JSON.stringify(curProfile));
        }
    } catch (e) {
        parentAdapter.log.error("exception in GetCurrentProfile [" + e + "]");
    }
    parentAdapter.log.debug("profile " + currentProfile);

    if (parentAdapter.config.UseVisFromPittini) {
        await Vis_SetCurrentProfile(currentProfile);
    }
    return currentProfile;
}

//*******************************************************************
//
async function AddStatusToLog(room, status) {

    try {
        //vorn anhängen
        if (room.StatusLog.length == 0 || room.StatusLog[0].status != status || room.StatusLog[0].target != room.CurrentTarget) {
            const now = new Date();
            const datestring = ("0" + now.getDate()).slice(-2) + "." + ("0" + (now.getMonth() + 1)).slice(-2) + "." +
                now.getFullYear() + " " + ("0" + now.getHours()).slice(-2) + ":" + ("0" + now.getMinutes()).slice(-2) + ":" + ("0" + now.getSeconds()).slice(-2);

            room.StatusLog.unshift({
                date: datestring,
                status: status,
                target: room.CurrentTarget
            });

            if (room.StatusLog.length > 20) {
                room.StatusLog.pop();
            }
        } else {
            parentAdapter.log.debug("AddStatusToLog skip " + room.Name + " " + status + " " + room.CurrentTarget + "°C");
        }

        /* hinten anhängen
        if (room.StatusLog.length == 0 || room.StatusLog[room.StatusLog.length - 1].status != status || room.StatusLog[room.StatusLog.length - 1].target != room.currentTarget) {
            const now = new Date();
            const datestring = ("0" + now.getDate()).slice(-2) + "." + ("0" + (now.getMonth() + 1)).slice(-2) + "." +
                now.getFullYear() + " " + ("0" + now.getHours()).slice(-2) + ":" + ("0" + now.getMinutes()).slice(-2) + ":" + ("0" + now.getSeconds()).slice(-2);
    
            room.StatusLog.push({
                date: datestring,
                status: status,
                target: room.currentTarget + "°C"
            });
    
            if (room.StatusLog.length > 20) {
                room.StatusLog.splice(0, 1);
            }
        }
    
        */
    } catch (e) {
        parentAdapter.log.error("exception in AddStatusToLog [" + e + "] " + JSON.stringify(room));
    }
}


//*******************************************************************
//
async function UpdateDPs(room) {

    try {
        parentAdapter.log.debug("UpdateDPs for " + room.Name + " " + room.State + " " + room.ReducedState);

        const id = "Rooms." + room.Name;
        await parentAdapter.setStateAsync(id + ".CurrentTarget", { val: room.CurrentTarget, ack: true });
        await parentAdapter.setStateAsync(id + ".ActiveTimeSlot", { val: room.ActiveTimeSlot, ack: true });
        await parentAdapter.setStateAsync(id + ".CurrentTimePeriodFull", { val: room.CurrentTimePeriodFull, ack: true });


        if (parentAdapter.config.UseVisFromPittini) {
            await Vis_SetCurrentTimePeriod(room.Name, room.CurrentTimePeriod);
        }
        await parentAdapter.setStateAsync(id + ".CurrentTimePeriod", { val: room.CurrentTimePeriod, ack: true });
        await parentAdapter.setStateAsync(id + ".CurrentTimePeriodTime", { val: room.CurrentTimePeriodTime, ack: true });
        await parentAdapter.setStateAsync(id + ".CurrentTimePeriodTemperature", { val: room.CurrentProfileTarget, ack: true });

        //nur ändern wenn geändert wegen Zeitstempel!!
        const temp = await parentAdapter.getStateAsync(id + ".WindowIsOpen");
        if (temp == null ||  temp === undefined || temp.val == null ||  temp.val === undefined || temp.val != room.WindowIsOpen) {
            await parentAdapter.setStateAsync(id + ".WindowIsOpen", { val: room.WindowIsOpen, ack: true }); 
        }
        let state = room.State;
        if (room.IsInReduced) {
            state += " " + room.ReducedState;
        }
        if (room.PublicHolidyToday) {
            state += " public holiday";
        } else if (room.HolidayPresent) {
            state += " holiday at home";
        }

        AddStatusToLog(room, state);

        await parentAdapter.setStateAsync(id + ".State", { val: state, ack: true });


        /*
        if (!room.IsInOverride) {
            const temp = await parentAdapter.getStateAsync(id + ".TemperaturOverride");
            if (temp != null && temp.val != 0) {
                await parentAdapter.setStateAsync(id + ".TemperaturOverride", { val: 0, ack: true });
            }
        }
        */

        await UpdateStatusLog(room);
        await UpdateVisState();
    } catch (e) {
        parentAdapter.log.error("exception in UpdateDPs [" + e + "] ");
    }
}

async function UpdateStatusLog(room) {

    try {
        const id = "Rooms." + room.Name;
        const now = new Date();
        const datestring = ("0" + now.getDate()).slice(-2) + "." + ("0" + (now.getMonth() + 1)).slice(-2) + "." +
            now.getFullYear() + " " + ("0" + now.getHours()).slice(-2) + ":" + ("0" + now.getMinutes()).slice(-2) + ":" + ("0" + now.getSeconds()).slice(-2);
        await parentAdapter.setStateAsync("LastProgramRun", { val: datestring, ack: true });

        let status = "";
        for (let i = 0; i < room.StatusLog.length; i++) {
            if (room.StatusLog[i].target != -99) {
                status += " " + room.StatusLog[i].date + " " + room.StatusLog[i].status + " " + room.StatusLog[i].target + "°C <br>";
            } else {
                status += " " + room.StatusLog[i].date + " " + room.StatusLog[i].status + " <br>";
            }
        }


        if (parentAdapter.config.UseVisFromPittini) {

            await Vis_SetStatuslog(room.Name, status);
        }
        await parentAdapter.setStateAsync(id + ".StatusLog", { val: status, ack: true });
    } catch (e) {
        parentAdapter.log.error("exception in UpdateStatusLog [" + e + "] " + JSON.stringify(room));
    }

}

async function UpdateVisState() {

    try {
        if (parentAdapter.config.UseVisFromPittini) {
            let RoomsHtmlTable = "";

            const colNameRoom = GetTranslation(parentAdapter, "room", SystemLanguage);
            const colNameTarget = GetTranslation(parentAdapter, "target", SystemLanguage);
            const colNameCurrent = GetTranslation(parentAdapter, "current", SystemLanguage);
            const colNameCurrentInt = GetTranslation(parentAdapter, "current_int", SystemLanguage);
            const colNameCurrentExt = GetTranslation(parentAdapter, "current_ext", SystemLanguage);
            const colNameOffset = GetTranslation(parentAdapter, "offset", SystemLanguage);

            const colNameActuator = GetTranslation(parentAdapter, "actuator", SystemLanguage);
            const colNameWindow = GetTranslation(parentAdapter, "window", SystemLanguage);
            const colNameState = GetTranslation(parentAdapter, "status", SystemLanguage);




            RoomsHtmlTable += "<div>";
            RoomsHtmlTable += "<table>";
            RoomsHtmlTable += "<tr>";
            RoomsHtmlTable += "<th> " + colNameRoom + " </th>";
            RoomsHtmlTable += "<th> " + colNameTarget + " </th>";


            if (parentAdapter.config.UseAddTempSensors) {
                RoomsHtmlTable += "<th> " + colNameCurrentInt + " </th>";
                RoomsHtmlTable += "<th> " + colNameCurrentExt + " </th>";
                RoomsHtmlTable += "<th> " + colNameOffset + " </th>";
            } else {
                RoomsHtmlTable += "<th> " + colNameCurrent + " </th>";
            }

            if (parentAdapter.config.UseActors) {

                RoomsHtmlTable += "<th> " + colNameActuator + " </th>";
            }
            if (parentAdapter.config.UseSensors) {
                RoomsHtmlTable += "<th> " + colNameWindow + " </th>";
            }

            RoomsHtmlTable += "<th> " + colNameState + " </th>";
            RoomsHtmlTable += "</tr>";

            for (let i = 0; i < Rooms.length; i++) {

                RoomsHtmlTable += "<tr>";
                RoomsHtmlTable += "<td>" + Rooms[i].Name + " </td>";

                const currentTemperature = Rooms[i].CurrentTemperature;
                const targetTemperature = Rooms[i].CurrentTarget;
                const offset = Rooms[i].TempOffset;

                let currentTemperatureExt = -99;

                if (parentAdapter.config.UseAddTempSensors && Rooms[i].hasAddTempSensors) {
                    currentTemperatureExt = Rooms[i].CurrentTemperatureAddSensor;
                }

                if (parentAdapter.config.VisUseSimple) {
                    let backgroundColor = "green";
                    if (targetTemperature > currentTemperature) {
                        backgroundColor = "red";
                    }

                    if (targetTemperature > -99 && Rooms[i].StatusLog.length > 0 && Rooms[i].StatusLog[0].status != "no heating") {
                        RoomsHtmlTable += "<td style='background-color:" + backgroundColor + "'>" + targetTemperature + "°C </td>";
                    } else {
                        RoomsHtmlTable += "<td>n/a</td>";
                    }
                } else {
                    let backgroundClass = "mdui-green-bg";
                    if (targetTemperature > currentTemperature) {
                        backgroundClass = "mdui-red-bg";
                    }

                    if (targetTemperature > -99 && Rooms[i].StatusLog.length > 0 && Rooms[i].StatusLog[0].status != "no heating") {
                        RoomsHtmlTable += "<td class='" + backgroundClass + "'>" + targetTemperature + "°C </td>";
                    } else {
                        RoomsHtmlTable += "<td>n/a</td>";
                    }

                }


                if (currentTemperature > -99) {
                    RoomsHtmlTable += "<td>" + currentTemperature + "°C </td>";
                } else {
                    RoomsHtmlTable += "<td>n/a </td>";
                }

                if (parentAdapter.config.UseAddTempSensors) {
                    if (currentTemperatureExt > -99) {
                        RoomsHtmlTable += "<td>" + currentTemperatureExt + "°C </td>";
                    } else {
                        RoomsHtmlTable += "<td>n/a </td>";
                    }

                    RoomsHtmlTable += "<td>" + offset + "°C </td>";

                }

                if (parentAdapter.config.UseActors) {

                    const stateNameOn = GetTranslation(parentAdapter, "on", SystemLanguage);
                    const stateNameOff = GetTranslation(parentAdapter, "off", SystemLanguage);

                    let ActorState = stateNameOff;
                    if (Rooms[i].ActorState) {
                        ActorState = stateNameOn;
                        RoomsHtmlTable += "<td style='background-color:orange'>" + ActorState + "</td>";
                    } else {
                        RoomsHtmlTable += "<td>" + ActorState + "</td>";
                    }
                }

                if (parentAdapter.config.UseSensors) {

                    const windowStateNameOpen = GetTranslation(parentAdapter, "opened", SystemLanguage);
                    const windowStateNameClosed = GetTranslation(parentAdapter, "closed", SystemLanguage);


                    if (Rooms[i].hasWindowSensors) {

                        if (parentAdapter.config.VisUseSimple) {
                            let backgroundColor = "red";
                            if (Rooms[i].WindowIsOpen) {
                                backgroundColor = "red";
                                RoomsHtmlTable += "<td style='background-color:" + backgroundColor + "' > " + windowStateNameOpen + " </td>";
                            } else {
                                backgroundColor = "green";
                                RoomsHtmlTable += "<td style='background-color:" + backgroundColor + "' > " + windowStateNameClosed + " </td>";
                            }
                        } else {
                            let backgroundClass = "mdui-red-bg";
                            if (Rooms[i].WindowIsOpen) {
                                backgroundClass = "mdui-red-bg";
                                RoomsHtmlTable += "<td class='" + backgroundClass + "' > " + windowStateNameOpen + " </td>";
                            } else {
                                backgroundClass = "mdui-green-bg";
                                RoomsHtmlTable += "<td class='" + backgroundClass + "' > " + windowStateNameClosed + " </td>";
                            }
                        }
                    } else {
                        RoomsHtmlTable += "<td>n/a</td>";
                    }
                }

                if (Rooms[i].StatusLog != null && Rooms[i].StatusLog.length > 0) {
                    RoomsHtmlTable += "<td>" + Rooms[i].StatusLog[0].status + " </td>";
                } else {
                    RoomsHtmlTable += "<td> </td>";
                }
                RoomsHtmlTable += "</tr>";
            }

            RoomsHtmlTable += "</table>";
            RoomsHtmlTable += "</div>";

            await parentAdapter.setStateAsync("vis.RoomStatesHtmlTable", { ack: true, val: RoomsHtmlTable });
        }
    } catch (e) {
        parentAdapter.log.error("exception in UpdateVisState [" + e + "] " );
    }
}

async function GetCurrentTarget(room) {
    let target = 0;
    let ctr = 0;
    try {

        const thermostats = findObjectsByKey(Thermostats, "room", room.Name);

        if (thermostats != null) {
            for (let d = 0; d < thermostats.length; d++) {

                if (thermostats[d].OID_Target.length > 0) {

                    const current = await parentAdapter.getForeignStateAsync(thermostats[d].OID_Target);

                    parentAdapter.log.debug("got current target from " + thermostats[d].OID_Target + " " + current.val);

                    target += current.val;
                    ctr++;
                }
            }
        }

        parentAdapter.log.debug("ctr " + ctr + " " + target);
        if (ctr > 0) {
            target = target / ctr;
        } else {
            target = -99;
        }
        parentAdapter.log.debug("ctr " + ctr + " new target " + target);

    } catch (e) {
        parentAdapter.log.error("exception in GetCurrentTarget [" + e + "] ");
    }
    return target;
}

//*******************************************************************
//

function round(value, step) {
    step || (step = 1.0);
    const inv = 1.0 / step;
    return Math.round(value * inv) / inv;
}

async function SetRoomTemperature(room, temperature) {

    parentAdapter.log.debug("SetRoomTemperature started for " + room.Name + " target " + temperature + " with offset " + room.TempOffset);

    try {
        let target = Check4ValidTemperature(parentAdapter, temperature);
        const thermostats = findObjectsByKey(Thermostats, "room", room.Name);

        //2021-12-24: only if not in reduced
        //2022-01-07: round to 0.5 because thermostats use only 0.5 accuracy
        if (parentAdapter.config.UseAddTempSensors && room.State == "auto" && !room.IsInReduced) {
            target = round(target + room.TempOffset, 0.5);
        }

        //2022-02-05 min temp check added
        target = await CheckMinTemp(room.Name, target);


        if (thermostats != null) {

            const InterThermostatDelay = parseInt(parentAdapter.config.InterThermostatDelay);

            // prüfung, wieviele delays in den anderen Räumen schon laufen
            let delayCounter = 0;
            for (let n = 0; n < Thermostats.length; n++) {
                if (Thermostats[n].SetTimerId != null) {
                    delayCounter++;
                }
                
            }

            for (let d = 0; d < thermostats.length; d++) {

                if (thermostats[d].OID_Target.length > 0) {
                    
                    const current = await parentAdapter.getForeignStateAsync(thermostats[d].OID_Target);

                    if (target > -99) {
                        room.CurrentTarget = target;
                        thermostats[d].lastTarget = thermostats[d].currentTarget;
                        thermostats[d].currentTarget = target;
                    }

                    if (current != null) {
                        if (current.val != target && target > -99) {

                            await DisableSubscriptionTarget(thermostats[d].OID_Target, room.Name);

                            if (InterThermostatDelay>0) {
                                const delay = delayCounter * InterThermostatDelay;
                                thermostats[d].SetTimerId = setTimeout(SetThermostatTarget, delay, room.Name, thermostats[d], target );
                                delayCounter++;
                            } else {
                                ThermostatLog(room.Name, thermostats[d], target);

                                //await parentAdapter.setForeignStateAsync(thermostats[d].OID_Target, { ack: false, val: target });
                                await setActorState(thermostats[d], target);
                            }
                        } else {
                            parentAdapter.log.debug(room.Name + " nothing to do to for " + thermostats[d].OID_Target + " , target " + target + " is already set " + current.val);
                        }
                    } else {
                        parentAdapter.log.error(room.Name + " could not read " + thermostats[d].OID_Target);
                    }
                } else {
                    parentAdapter.log.error(room.Name + " OID_Target (" + thermostats[d].OID_Target + ") is not valid for " + thermostats[d].name );
                }
            }
        }
    } catch (e) {
        parentAdapter.log.error("exception in SetRoomTemperature [" + e + "] ");
    }
}


async function SetThermostatTarget(roomName, thermostat, target) {

    if (thermostat != null) {

        ThermostatLog(roomName, thermostat, target);

        if (thermostat.SetTimerId != null) {
            parentAdapter.log.debug("need to cancel ThermostatSetTimer " + thermostat.name + " " + thermostat.OID_Target);
            clearTimeout(thermostat.SetTimerId);
            thermostat.SetTimerId = null;
        }

        //await parentAdapter.setForeignStateAsync(thermostat.OID_Target, { ack: false, val: target });
        await setActorState(thermostat, target);
    }
}


//*******************************************************************
//
async function HandleActors(room) {

    try {
        if (parentAdapter.config.UseActors) {
            const actors = findObjectsByKey(Actors, "room", room.Name);
            const thermostats = findObjectsByKey(Thermostats, "room", room.Name);

            // prüfung, wieviele delays in den anderen Räumen schon laufen
            let delayCounter = 0;
            for (let n = 0; n < Actors.length; n++) {
                if (Actors[n].ActorOnTimerId != null) {
                    delayCounter++;
                } else if (Actors[n].ActorOffTimerId != null) {
                    delayCounter++;
                }
            }

            parentAdapter.log.debug("HandleActors for " + room.Name + " " + room.State + ",  timers " + delayCounter + " PI " + room.PowerInterruptionPeriodActive);

            const InterActorDelay = parseInt(parentAdapter.config.InterActorDelay);

            if (actors != null && actors.length > 0 && thermostats != null && thermostats.length > 0) {


                if (room.PowerInterruptionPeriodActive) {
                    const target = false; //all off
                    room.ActorState = target;

                    for (let d = 0; d < actors.length; d++) {

                        const currentState = await parentAdapter.getForeignStateAsync(actors[d].OID);

                        if (currentState != null && typeof currentState !== "undefined") {
                            if (currentState.val !== target) {

                                if (InterActorDelay > 0) {
                                    const delay = delayCounter * InterActorDelay;
                                    if (target) {
                                        actors[d].ActorOnTimerId = setTimeout(ActorOnTimeout, delay, actors[d]);
                                    } else {
                                        actors[d].ActorOffTimerId = setTimeout(ActorOffTimeout, delay, actors[d]);
                                    }
                                    delayCounter++;
                                } else {
                                    //await parentAdapter.setForeignStateAsync(actors[d].OID, target);
                                    await setActorState(actors[d], target);
                                    ActorLog(actors[d], target);
                                }
                                parentAdapter.log.debug(" actor " + actors[d].OID + " to " + target);
                            } else {
                                parentAdapter.log.debug(" actor " + actors[d].OID + " nothing to do");
                            }
                        } else {
                            //await parentAdapter.setForeignStateAsync(actors[d].OID, target);
                            await setActorState(actors[d], target);
                            ActorLog(actors[d], target);
                            parentAdapter.log.debug(" actor " + actors[d].OID + " to " + target + " current undefined");
                        }
                    }


                } else if (!room.isActive || !room.HeatingPeriod) {
                    //not in heating period, thermostat is doing nothing an actor should be set to something:
                    //see issue #292: when room is not active, swtch off actuators
                    parentAdapter.log.debug("HandleActors out of heating period or inactive room " + room.Name + " " + JSON.stringify(actors));

                    let target = false;
                    let setTarget = true;

                    if (parseInt(parentAdapter.config.UseActorsIfNotHeating) === 1) {
                        setTarget = false;
                    } else if (parseInt(parentAdapter.config.UseActorsIfNotHeating) === 2) {
                        target = false;
                    } else if (parseInt(parentAdapter.config.UseActorsIfNotHeating) === 3) {
                        target = true;
                    } else {
                        parentAdapter.log.warn("HandleActorsGeneral: unknown target value: " + parseInt(parentAdapter.config.UseActorsIfNotHeating));
                    }
                    if (setTarget) {
                        room.ActorState = target;

                        for (let d = 0; d < actors.length; d++) {

                            const currentState = await parentAdapter.getForeignStateAsync(actors[d].OID);

                            if (currentState != null && typeof currentState !== "undefined") {
                                if (currentState.val !== target) {

                                    if (InterActorDelay > 0) {
                                        const delay = delayCounter * InterActorDelay;
                                        if (target) {
                                            actors[d].ActorOnTimerId = setTimeout(ActorOnTimeout, delay, actors[d]);
                                        } else {
                                            actors[d].ActorOffTimerId = setTimeout(ActorOffTimeout, delay, actors[d]);
                                        }
                                        delayCounter++;
                                    } else {
                                        //await parentAdapter.setForeignStateAsync(actors[d].OID, target);
                                        await setActorState(actors[d], target);
                                        ActorLog(actors[d], target);
                                    }
                                    parentAdapter.log.debug(" actor " + actors[d].OID + " to " + target);
                                } else {
                                    parentAdapter.log.debug(" actor " + actors[d].OID + " nothing to do");
                                }
                            } else {
                                //await parentAdapter.setForeignStateAsync(actors[d].OID, target);
                                await setActorState(actors[d], target);
                                ActorLog(actors[d], target);
                                parentAdapter.log.debug(" actor " + actors[d].OID + " to " + target + " current undefined");
                            }
                        }
                    }
                } else {
                    parentAdapter.log.debug("HandleActors " + room.Name + " actors " + actors.length + " thermostats " + thermostats.length);

                    //always the first thermostat
                    const current = await parentAdapter.getForeignStateAsync(thermostats[0].OID_Current);
                    parentAdapter.log.debug("HandleActors: got Status from " + thermostats[0].OID_Current + " " + JSON.stringify(current));
                    const target = await parentAdapter.getForeignStateAsync(thermostats[0].OID_Target);
                    parentAdapter.log.debug("HandleActors: got Status from " + thermostats[0].OID_Target + " " + JSON.stringify(target));

                    if (current != null && target != null) {

                        const value2set = await regulator_GetStatus(room, current.val, target.val);

                        room.ActorState = value2set;

                        parentAdapter.log.debug("HandleActors: " + room.Name + " " + " got current " + current.val + " target " + target.val + " = " + value2set);

                        for (let d = 0; d < actors.length; d++) {
                            //parentAdapter.log.debug("HandleActors: get Status from " + actors[d].OID);
                            const valueSet = await parentAdapter.getForeignStateAsync(actors[d].OID);
                            parentAdapter.log.debug("HandleActors: got Status from " + actors[d].OID + " " + JSON.stringify(valueSet));

                            if (valueSet != null) {

                                if (value2set != valueSet.val) {

                                    if (value2set == false) {
                                        if (parseInt(parentAdapter.config.ActorBeforeOffDelay) > 0) {
                                            if (actors[d].ActorOnTimerId != null) {
                                                parentAdapter.log.debug(room.Name + " cancel actor on delay");
                                                clearTimeout(actors[d].ActorOnTimerId);
                                                actors[d].ActorOnTimerId = null;
                                            } else {
                                                if (actors[d].ActorOffTimerId == null) {
                                                    parentAdapter.log.debug(room.Name + " actor before off delay " + parseInt(parentAdapter.config.ActorBeforeOffDelay) * 1000 + " for " + actors[d].name);
                                                    const delay = parseInt(parentAdapter.config.ActorBeforeOffDelay) * 1000 + delayCounter * InterActorDelay;
                                                    actors[d].ActorOffTimerId = setTimeout(ActorOffTimeout, delay, actors[d]);
                                                    if (InterActorDelay > 0) {
                                                        delayCounter++;
                                                    }
                                                }
                                            }
                                        } else {
                                            if (InterActorDelay > 0) {
                                                const delay = delayCounter * InterActorDelay;
                                                actors[d].ActorOffTimerId = setTimeout(ActorOffTimeout, delay, actors[d]);
                                                delayCounter++;
                                            } else {
                                                //await parentAdapter.setForeignStateAsync(actors[d].OID, false);
                                                await setActorState(actors[d], false);
                                                ActorLog(actors[d], false);
                                            }
                                        }
                                    } else if (value2set == true) {
                                        if (parseInt(parentAdapter.config.ActorBeforeOnDelay) > 0) {
                                            if (actors[d].ActorOffTimerId != null) {
                                                parentAdapter.log.debug(room.Name + " cancel actor off delay");
                                                clearTimeout(actors[d].ActorOffTimerId);
                                                actors[d].ActorOffTimerId = null;
                                            } else {
                                                if (actors[d].ActorOnTimerId == null) {
                                                    parentAdapter.log.debug(room.Name + " actor before on delay " + parseInt(parentAdapter.config.ActorBeforeOnDelay) * 1000 + " for " + actors[d].name);
                                                    const delay = parseInt(parentAdapter.config.ActorBeforeOffDelay) * 1000 + delayCounter * InterActorDelay;
                                                    actors[d].ActorOnTimerId = setTimeout(ActorOnTimeout, delay, actors[d]);
                                                    if (InterActorDelay > 0) {
                                                        delayCounter++;
                                                    }
                                                }
                                            }
                                        } else {
                                            if (InterActorDelay > 0) {
                                                const delay = delayCounter * InterActorDelay;
                                                actors[d].ActorOnTimerId = setTimeout(ActorOnTimeout, delay, actors[d]);
                                                delayCounter++;
                                            } else {
                                                //await parentAdapter.setForeignStateAsync(actors[d].OID, true);
                                                await setActorState(actors[d], true);
                                                ActorLog(actors[d], true);
                                            }
                                        }
                                    }
                                } else {
                                    parentAdapter.log.debug("HandleActors: " + room.Name + " nothing to do " + valueSet.val + " == " + value2set);
                                }
                            } else {
                                parentAdapter.log.error("HandleActors: could not read " + actors[d].OID + " " + JSON.stringify(valueSet));
                            }
                        }
                    } else {
                        parentAdapter.log.warn("HandleActors: could not read current or target temperature on " + thermostats[0].name);
                    }
                }
            } else {
                parentAdapter.log.debug("HandleActors: no actors and/or no thermostats in " + room.Name);
            }
        }
    } catch (e) {
        parentAdapter.log.error("exception in HandleActors [" + e + "] " + room.Name + " " + room.State);
    }
}

async function ActorOnTimeout(actor) {
    try {
        //const actor = findObjectByKey(Actors, "OID", actorOID);
        if (actor != null) {
            ActorLog(actor, true);

            if (actor.ActorOnTimerId != null) {
                parentAdapter.log.debug("need to cancel ActorOnTimer " + actor.name + " " + actor.OID);
                clearTimeout(actor.ActorOnTimerId);
                actor.ActorOnTimerId = null;
            }

            //await parentAdapter.setForeignStateAsync(actor.OID, true);
            await setActorState(actor, true);
        }
        await CheckAllActors();
    } catch (e) {
        parentAdapter.log.error("exception in ActorOnTimeout [" + e + "] " + actor.name);
    }
}

async function ActorOffTimeout(actor) {
    try {
        //const actor = findObjectByKey(Actors, "OID", actorOID);
        if (actor != null) {

            ActorLog(actor, false);

            
            if (actor.ActorOffTimerId != null) {
                parentAdapter.log.debug("need to cancel ActorOnTimer " + actor.name + " " + actor.OID);
                clearTimeout(actor.ActorOffTimerId);
                actor.ActorOffTimerId = null;
            }

            //await parentAdapter.setForeignStateAsync(actor.OID, false);
            await setActorState(actor, false);
        }
        await CheckAllActors();
    } catch (e) {
        parentAdapter.log.error("exception in ActorOffTimeout [" + e + "] " + actor.name);
    }
}


//*******************************************************************
//
async function SubscribeDevices() {

    parentAdapter.log.info("subscribe devices start");

    //thermostats
    //if (parentAdapter.config.UseActors) {
    //we need this to update room status list
    parentAdapter.log.info("subscribe thermostats current " + Thermostats.length);
    for (let t = 0; t < Thermostats.length; t++) {

        if (Thermostats[t].OID_Current != null && Thermostats[t].OID_Current.length > 0) {
            parentAdapter.log.info("subscribe thermostat current " + Thermostats[t].name + " " + Thermostats[t].OID_Current);
            parentAdapter.subscribeForeignStates(Thermostats[t].OID_Current);
        } else {
            parentAdapter.log.warn("OID Current for " + Thermostats[t].name + " not set");
        }
    }
    //}
    if (parentAdapter.config.UseChangesFromThermostat > 1) {
        parentAdapter.log.info("subscribe thermostats target " + Thermostats.length);
        for (let t = 0; t < Thermostats.length; t++) {

            if (Thermostats[t].OID_Target != null && Thermostats[t].OID_Target.length > 0) {
                parentAdapter.log.info("subscribe thermostat target " + Thermostats[t].name + " " + Thermostats[t].OID_Target);
                parentAdapter.subscribeForeignStates(Thermostats[t].OID_Target);
            } else {
                parentAdapter.log.warn("OID Target for " + Thermostats[t].name + " not set");
            }
        }
    }

    //sensors
    if (parentAdapter.config.UseSensors) {
        for (let s = 0; s < Sensors.length; s++) {
            if (Sensors[s].OID != null && Sensors[s].OID.length > 0) {
                parentAdapter.log.info("subscribe sensor " + Sensors[s].name + " " + Sensors[s].OID);
                parentAdapter.subscribeForeignStates(Sensors[s].OID);
            } else {
                parentAdapter.log.warn("OID for " + Sensors[s].name + " not set");
            }
        }
    }

    //add temp sensors
    if (parentAdapter.config.UseAddTempSensors) {
        for (let s = 0; s < AddTempSensors.length; s++) {
            if (AddTempSensors[s].OID != null && AddTempSensors[s].OID.length > 0) {
                parentAdapter.log.info("subscribe sensor " + AddTempSensors[s].name + " " + AddTempSensors[s].OID);
                parentAdapter.subscribeForeignStates(AddTempSensors[s].OID);
            } else {
                parentAdapter.log.warn("OID for " + AddTempSensors[s].name + " not set");
            }
        }
    }

    parentAdapter.log.info("subscribe devices done");
}

//*******************************************************************
//
async function DisableSubscriptionTarget(thermostats_oid, room) {

    parentAdapter.log.debug("unsubscribe " + thermostats_oid);

    await parentAdapter.unsubscribeForeignStatesAsync(thermostats_oid);

    //clear cmd list
    if (ChangeStatusCmdList.length > 0) {
        for (let i = ChangeStatusCmdList.length - 1; i >= 0; i--) {
            if (ChangeStatusCmdList.state == "Thermostats_Target" && ChangeStatusCmdList.room == room) {
                parentAdapter.log.debug("remove one entry from cmd list ");
                ChangeStatusCmdList.splice(i, 1);
            }
        }
    }
    //start timer
    setTimeout(EnableSubscriptionTarget, 5000, thermostats_oid);
}


function EnableSubscriptionTarget(thermostats_oid) {

    if (parentAdapter.config.UseChangesFromThermostat > 1) {

        parentAdapter.log.debug("subscribe " + thermostats_oid);

        parentAdapter.subscribeForeignStatesAsync(thermostats_oid);
    }
    //hier noch Änderungen prüfen?

}

//*******************************************************************
//
async function UnsubscribeDevices() {

    //thermostats
    if (parentAdapter.config.UseChangesFromThermostat > 1) {
        for (let t = 0; t < Thermostats.length; t++) {

            if (Thermostats[t].OID_Target != null && Thermostats[t].OID_Target.length > 0) {
                parentAdapter.log.info("unsubscribe " + Thermostats[t].name + " " + Thermostats[t].OID_Target);
                parentAdapter.unsubscribeForeignStates(Thermostats[t].OID_Target);
            } else {
                parentAdapter.log.warn("OID Target for " + Thermostats[t].name + " not set");
            }
        }
    }
}



//*******************************************************************
//
async function CheckStateChangeDevice(id, state) {
    let bRet = false;

    parentAdapter.log.debug("CheckStateChangeDevice " + id);

    if (parentAdapter.config.UseSensors) {
        const devices = findObjectsByKey(Sensors, "OID", id);

        for (let d = 0; d < devices.length; d++) {
            const room = findObjectByKey(Rooms, "Name", devices[d].room);

            if (room != null) {

                const newWindowState = checkWindowSensor(devices[d], room.Name, state.val);

                //only if changed




                if (newWindowState != devices[d].lastState) {

                    devices[d].lastState = newWindowState;

                    parentAdapter.log.debug("handle sensor " + d + " " + devices[d].OID + ", state " + room.State + ", isOpen " + room.WindowIsOpen + ", new sensor state " + state.val + ", new window state " + newWindowState + ", openDelay " + parentAdapter.config.SensorOpenDelay + ", closeDelay " + parentAdapter.config.SensorCloseDelay);

                    //short closed, but now still open: cancel timer
                    if (room.WindowIsOpen == true && newWindowState == true && devices[d].WindowCloseTimerId != null) {
                        parentAdapter.log.debug("cancel Close TimerId for " + devices[d].name + " in " + room.Name);
                        clearTimeout(devices[d].WindowCloseTimerId);
                        devices[d].WindowCloseTimerId = null;
                    } else if (room.WindowIsOpen == false && newWindowState == false && devices[d].WindowOpenTimerId != null) {
                        //short opened, but now still close: cancel timer
                        parentAdapter.log.debug("cancel Open TimerId for " + devices[d].name);
                        clearTimeout(devices[d].WindowOpenTimerId);
                        devices[d].WindowOpenTimerId = null;
                    } else if (room.WindowIsOpen == false && newWindowState == true && parseInt(parentAdapter.config.SensorOpenDelay) > 0) {
                        //window is just opening
                        const data = {
                            room: room.Name,
                            OID: devices[d].OID,
                            value: state.val
                        };

                        if (devices[d].WindowOpenTimerId != null) {
                            parentAdapter.log.debug("cancel Open TimerId for " + devices[d].name);
                            clearTimeout(devices[d].WindowOpenTimerId);
                            devices[d].WindowOpenTimerId = null;
                        }

                        devices[d].WindowOpenTimerId = setTimeout(WindowOpenTimeout, parseInt(parentAdapter.config.SensorOpenDelay) * 1000, data);
                        parentAdapter.log.debug("sensor open delay " + parseInt(parentAdapter.config.SensorOpenDelay) * 1000 + " for " + devices[d].name + " in " + room.Name);
                    } else if (room.WindowIsOpen == true && newWindowState == false && parseInt(parentAdapter.config.SensorCloseDelay) > 0) {
                        //window is just closing
                        const data = {
                            room: room.Name,
                            OID: devices[d].OID,
                            value: state.val
                        };

                        if (devices[d].WindowCloseTimerId != null) {
                            parentAdapter.log.debug("cancel Close TimerId for " + devices[d].name + " in " + room.Name);
                            clearTimeout(devices[d].WindowCloseTimerId);
                            devices[d].WindowCloseTimerId = null;
                        }

                        devices[d].WindowCloseTimerId = setTimeout(WindowCloseTimeout, parseInt(parentAdapter.config.SensorCloseDelay) * 1000, data);
                        parentAdapter.log.debug("sensor close delay " + parseInt(parentAdapter.config.SensorCloseDelay) * 1000 + " for " + devices[d].name + " in " + room.Name);
                    } else {
                        //see issue #265 and #305
                        //without delay we set new state immideately, but only if changed

                        //2022-10-17 see issue #327
                        //warum nicht immer setzen? check auf ungleich hat ja oben schon stattgefunden

                        //if ((room.WindowIsOpen == true && newWindowState == false)
                        //    || (room.WindowIsOpen == false && newWindowState == true)
                        //) {

                        const data = {
                            OID: id,
                            state: state.val
                        };

                        await ChangeStatus("Sensor", devices[d].room, data);
                        //}
                        //else {
                        //    parentAdapter.log.debug("no window changed in  " + room.Name);
                        //}
                    }
                } else {
                    parentAdapter.log.debug("nothing to do for " + devices[d].OID + " because no state change: " + newWindowState + "==" + devices[d].lastState);
                }
            }
            bRet = true;
        }
    }
    //if (!bRet && parentAdapter.config.UseActors) {
    //damit wir die Änderungen der IstTemperatur anzeigen können
    if (!bRet) {
        const devices = findObjectsByKey(Thermostats, "OID_Current", id);

        for (let d = 0; d < devices.length; d++) {
            await ChangeStatus("Thermostats_Current", devices[d].room, state);
            bRet = true;
        }
    }

    if (!bRet && parentAdapter.config.UseChangesFromThermostat > 1) {
        const devices = findObjectsByKey(Thermostats, "OID_Target", id);

        for (let d = 0; d < devices.length; d++) {

            //nur Änderungen übernehmen
            //see issue #272: change only if different to previous value
            if (devices[d].lastTargetFromDevice != state.val) {
                devices[d].lastTargetFromDevice = state.val;
                await ChangeStatus("Thermostats_Target", devices[d].room, state);
            }
            bRet = true;
        }
    }

    if (!bRet && parentAdapter.config.UseAddTempSensors) {
        const devices = findObjectsByKey(AddTempSensors, "OID", id);

        for (let d = 0; d < devices.length; d++) {
            await ChangeStatus("AddTempSensor", devices[d].room, state);
            bRet = true;
        }
    }


    return bRet;
}

async function CheckSensors4Room(room) {

    let windowIsOpen = false;
    let WindowIsOpenChanged = "never";

    let timestamp = 0;


    if (room.sensors != null) {

        for (let i = 0; i < room.sensors.length; i++) {

            const value = await parentAdapter.getForeignStateAsync(room.sensors[i].OID);

            if (value != null) {
                room.sensors[i].state = value.val;

                if (value.lc > timestamp) {
                    timestamp = value.lc;
                }
            } else {
                parentAdapter.log.error("could not read " + room.sensors[i].OID);
            }
        }

        for (let i = 0; i < room.sensors.length; i++) {

            //hier datatype beachten!!
            const bRet = checkWindowSensor(room.sensors[i], room.Name, room.sensors[i].state);


            const devices = findObjectsByKey(Sensors, "OID", room.sensors[i].OID);

            if (devices != null) { 
                for (let d = 0; d < devices.length; d++) {
                    parentAdapter.log.debug("CheckSensors4Room update " + devices[d].OID + " with " + bRet);
                    devices[d].lastState = bRet;
                }
            }

            //wird das eigentlich gebraucht? lastState wird in anderer Liste verwendet
            room.sensors[i].lastState = bRet;

            parentAdapter.log.debug("CheckSensors4Room " + JSON.stringify(room.sensors[i]));


            //ein Fenster reicht...
            if (bRet) {
                windowIsOpen = bRet;
            }
        }

        WindowIsOpenChanged = timeConverter(SystemLanguage, timestamp);
    }

    parentAdapter.log.debug("result for CheckSensors4Room in " + room.Name + " is " + windowIsOpen + " since " + timestamp + " = " + room.WindowIsOpenChanged);


    const ret = {
        windowIsOpen: windowIsOpen,
        WindowIsOpenChanged: WindowIsOpenChanged
    };

    return ret;

}


async function WindowOpenTimeout(data) {
    /*
    const data = {
        room: room.Name,
        OID: devices[d].OID
    };
    */

    try {

        //const room = findObjectByKey(Rooms, "Name", data.room);
        const device = findObjectByKey(Sensors, "OID", data.OID);
        if (device != null) {
            parentAdapter.log.debug("Window open timeout for " + device.name + " in " + data.room  );

            if (device.WindowOpenTimerId!=null) {
                clearTimeout(device.WindowOpenTimerId);
                device.WindowOpenTimerId = null;
            }

            //const val = await CheckSensors4Room(room);

            const sensordata = {
                OID: data.OID,
                state: data.value
            };

            await ChangeStatus("Sensor", data.room, sensordata);
        }
    } catch (e) {
        parentAdapter.log.error("exception in WindowOpenTimeout [" + e + "] " + data.room);
    }
}

async function WindowCloseTimeout(data) {
/*
const data = {
  room: room.Name,
  OID: devices[d].OID
};
*/

    try {
        //const room = findObjectByKey(Rooms, "Name", data.room);
        const device = findObjectByKey(Sensors, "OID", data.OID);
        if (device != null) {

            parentAdapter.log.debug("Window close timeout for " + device.name + " in " + data.room );

            if (device.WindowCloseTimerId != null) {
                clearTimeout(device.WindowCloseTimerId);
                device.WindowCloseTimerId = null;
            }

            //const val = await CheckSensors4Room(room);

            const sensordata = {
                OID: data.OID,
                state: data.value
            };

            await ChangeStatus("Sensor", data.room, sensordata);
        }
    } catch (e) {
        parentAdapter.log.error("exception in WindowCloseTimeout [" + e + "] " + data.room);
    }
}


//*******************************************************************
//
async function StartStatemachine() {
    parentAdapter.log.info("start statemachine");


    try {
        //initial states for rooms
        for (let room = 0; room < Rooms.length; room++) {
            SetNewRoomState(Rooms[room], "starting");
            
            Rooms[room].WindowIsOpen = false;
            Rooms[room].IsInOverride = false;
            Rooms[room].IsInReduced = false;
            Rooms[room].IsInManual = false;
            Rooms[room].isActive = true;

            await ChangeStatus("ProfilPoint", Rooms[room].Name, -99);
        }

        //all thermostats
        await CheckAllThermostats();

        //additional sensors
        await CheckTemperatureOffset();

        //all sensors
        await CheckAllSensor();

        //all actors
        await CheckAllActors();

        //external states
        await CheckExternalStates();

        //current profile point
        await GetAllCurrentProfilePoint();

        for (let room = 0; room < Rooms.length; room++) {

            const key = "Rooms." + Rooms[room].Name + ".isActive";
            const isActive = await parentAdapter.getStateAsync(key);

            if (isActive != null &&  isActive !== undefined) {
                
                if (isActive.val) {
                    SetNewRoomState(Rooms[room], "auto");
                } else {
                    SetNewRoomState(Rooms[room], "no heating");
                }
            }
            await ChangeStatus("ProfilPoint", Rooms[room].Name, -99);
        }

        if (parentAdapter.config.UseVisFromPittini) {
            await CreateWindowStatesTable();
        }

        parentAdapter.log.info("statemachine started");
    } catch (e) {
        parentAdapter.log.error("exception in StartStatemachine [" + e + "]");
    }
}

//*******************************************************************
//
async function CheckTemperatureOffset() {

    if (parentAdapter.config.UseAddTempSensors) {
        parentAdapter.log.debug("check all additional temp sensors");
        for (let r = 0; r < Rooms.length; r++) {
            if (Rooms[r].hasAddTempSensors) {

                parentAdapter.log.debug("check " + Rooms[r].Name);

                const key = "Rooms." + Rooms[r].Name + ".TemperatureOffset";
                const curOffset = await parentAdapter.getStateAsync(key);

                if (curOffset != null) {
                    parentAdapter.log.debug("got offset " + curOffset.val + " for " + Rooms[r].Name);
                    Rooms[r].TempOffset = curOffset.val;
                } else {
                    parentAdapter.log.warn("could not read " + key);
                }

                const sensors = findObjectsByKey(AddTempSensors, "room", Rooms[r].Name);

                if (sensors != null) {

                    for (let s = 0; s < sensors.length; s++) {
                        const current = await parentAdapter.getForeignStateAsync(sensors[s].OID);

                        if (current != null) {

                            await CalculateTempOffset(Rooms[r], current);
                        } else {
                            parentAdapter.log.error("could not read " + sensors[s].OID);
                        }
                    }
                } else {
                    //see issue #274
                    if (Rooms[r].TempOffset != 0) {
                        parentAdapter.log.debug(Rooms[r].Name + " no additional sensor found, reset offset to 0");
                        Rooms[r].TempOffset = 0;
                        await parentAdapter.setStateAsync("Rooms." + Rooms[r].Name + ".TemperatureOffset", { val: Rooms[r].TempOffset, ack: true });
                    }
                }
            }
        }
    } else {
        //see issue #274
        parentAdapter.log.debug("reset temp offsets because not used");
        for (let r = 0; r < Rooms.length; r++) {
            if (Rooms[r].TempOffset != 0) {
                Rooms[r].TempOffset = 0;
                await parentAdapter.setStateAsync("Rooms." + Rooms[r].Name + ".TemperatureOffset", { val: Rooms[r].TempOffset, ack: true });
            }
        }
    }
}


//*******************************************************************
//
async function CheckAllThermostats() {
    parentAdapter.log.debug("check all active thermostats");

    for (let r = 0; r < Rooms.length; r++) {

        //find thermostats
        const thermostats = findObjectsByKey(Thermostats, "room", Rooms[r].Name);

        if (thermostats != null) {
            for (let d = 0; d < thermostats.length; d++) {

                if (thermostats[d].OID_Target.length > 0) {
                    const target = await parentAdapter.getForeignStateAsync(thermostats[d].OID_Target);
                    if (target != null) {
                        Rooms[r].CurrentTarget = target.val;
                    } else {
                        parentAdapter.log.error("could not read target OID " + thermostats[d].OID_Target + " in " + Rooms[r].Name);
                    }
                } else {
                    parentAdapter.log.error("target OID for " + thermostats[d].name + " in " + Rooms[r].Name + " is missing");
                }

                if (thermostats[d].OID_Current.length > 0) {
                    const current = await parentAdapter.getForeignStateAsync(thermostats[d].OID_Current);
                    if (current != null) {
                        Rooms[r].CurrentTemperature = current.val;
                    } else {
                        if (parentAdapter.config.UseActors) {
                            parentAdapter.log.error("could not read current OID " + thermostats[d].OID_Current + " in " + Rooms[r].Name);
                        }
                    }
                } else {
                    if (parentAdapter.config.UseActors) {
                        parentAdapter.log.error("current OID for " + thermostats[d].name + " in " + Rooms[r].Name + " is missing");
                    }
                }
            }
        }
    }
}


function checkWindowSensor(sensor, roomName, newState) {

    let windowIsOpen = false;

    if (newState != null &&  newState !== undefined) {

        switch (sensor.DataType) {

            default:
                parentAdapter.log.warn("Sensor " + sensor.name + " in " + roomName + " has no datatype. Please check in settings! currently boolean used");

                parentAdapter.log.debug("Sensor state " + newState + " ?= false");

                if (newState != false) {
                    windowIsOpen = true;
                    parentAdapter.log.debug("one window open in " + roomName + " " + sensor.OID);
                }
                break;

            case "boolean":

                parentAdapter.log.debug("Sensor state " + newState + " ?= " + sensor.valueClosed);

                if (newState != sensor.valueClosed) {
                    windowIsOpen = true;
                    parentAdapter.log.debug("boolean: one window open in " + roomName + " " + sensor.OID);
                } else {
                    parentAdapter.log.debug("boolean: one window closed in " + roomName + " " + sensor.OID);
                }
                break;

            case "number":
                //hier könnten mehrere Werte stehen?

                parentAdapter.log.debug("Sensor state " + newState + " ?= " + sensor.valueClosed);

                if (newState != sensor.valueClosed) {
                    windowIsOpen = true;
                    parentAdapter.log.debug("number: one window open in " + roomName + " " + sensor.OID);
                } else {
                    parentAdapter.log.debug("number: one window closed in " + roomName + " " + sensor.OID);
                }
                break;

            case "string":
                //hier könnten mehrere Werte stehen?

                parentAdapter.log.debug("Sensor state " + newState + " ?= " + sensor.valueClosed);


                if (newState != sensor.valueClosed) {
                    windowIsOpen = true;
                    parentAdapter.log.debug("string: one window open in " + roomName + " " + sensor.OID);
                } else {
                    parentAdapter.log.debug("string: one window closed in " + roomName + " " + sensor.OID);
                }
                break;
        }
    } else {
        parentAdapter.log.error("sensor state undefined " + roomName + " " + sensor.OID);
    }

    return windowIsOpen;
}


function AddSensorState(room, data) {

    parentAdapter.log.debug("add new sensor state in " + room.Name + " " + data.OID + " " + data.state);

    let windowIsOpen = false;

    if (room.sensors != null) {
        //find entry in room sensorstatuslist
        //const sensor = findObjectByKey(room.sensors, "OID", data.OID);

        //update
        //if (sensor != null) {
        //    sensor.state = data.state;
        //}
        //else {
        //    parentAdapter.log.error("SensorStatus in " + room.Name + " not found");
        //}
        //check for new WindowIsOpenResult

        for (let i = 0; i < room.sensors.length; i++) {

            //neuen Wert eintragen
            if (room.sensors[i].OID == data.OID) {
                room.sensors[i].state = data.state;
                parentAdapter.log.debug("update state of " + room.sensors[i].OID + " to " + data.state);
            }

            //hier type und wert beachten
            const bRet = checkWindowSensor(room.sensors[i], room.Name, room.sensors[i].state);
            //ein Fenster reicht
            if (bRet) {
                windowIsOpen = bRet;
            }
        }
    }

    parentAdapter.log.debug("result for AddSensorState in " + room.Name + " is " + windowIsOpen);
    return windowIsOpen;

}



//*******************************************************************
//
async function CheckAllSensor() {
    if (parentAdapter.config.UseSensors) {
        parentAdapter.log.info("check all active sensors");

        for (let room = 0; room < Rooms.length; room++) {

            if (Rooms[room].isActive) {
                const ret = await CheckSensors4Room(Rooms[room]);

                Rooms[room].WindowIsOpen = ret.windowIsOpen;
                Rooms[room].WindowIsOpenChanged = ret.WindowIsOpenChanged;
            }
        }
    }
}

//*******************************************************************
//
async function CheckAllActors() {
    try {
        if (parentAdapter.config.UseActors) {
            parentAdapter.log.debug("checking all actors");
            let actorsOn = 0;
            let noOfActors = 0;
            for (let i = 0; i < Actors.length; i++) {

                if (Actors[i].OID.length > 1) {

                    noOfActors++;
                    const current = await parentAdapter.getForeignStateAsync(Actors[i].OID);

                    if (current !== null &&  current !== undefined) {
                        if (current.val) {
                            actorsOn++;
                        }
                        Actors[i].lastState = current.val;
                    }
                }
            }

            const lastActorsOn = await parentAdapter.getStateAsync("ActorsOn");
            if (lastActorsOn == null || lastActorsOn.val != actorsOn) {
                parentAdapter.log.info(actorsOn + " actors are on of " + noOfActors);
                await parentAdapter.setStateAsync("ActorsOn", { val: actorsOn, ack: true });
            }
        }
    } catch (e) {
        parentAdapter.log.error("exception in CheckAllActors [" + e + "]");
    }
}

//*******************************************************************
//
async function CheckExternalStates() {
    try {
        parentAdapter.log.info("checking external states");

        const heatingPeriodActive = await parentAdapter.getStateAsync("HeatingPeriodActive");
        parentAdapter.log.debug("HeatingPeriodActive " + heatingPeriodActive.val);
        const Present = await parentAdapter.getStateAsync("Present");
        parentAdapter.log.debug("Present " + Present.val);
        const VacationAbsent = await parentAdapter.getStateAsync("VacationAbsent");
        parentAdapter.log.debug("VacationAbsent " + VacationAbsent.val);
        
        const HolidayPresent = await parentAdapter.getStateAsync("HolidayPresent");
        parentAdapter.log.debug("HolidayPresent " + HolidayPresent.val);
        const GuestsPresent = await parentAdapter.getStateAsync("GuestsPresent");
        parentAdapter.log.debug("GuestsPresent " + GuestsPresent.val);
        const PartyNow = await parentAdapter.getStateAsync("PartyNow");
        parentAdapter.log.debug("PartyNow " + PartyNow.val);
        const PublicHolidyToday = await parentAdapter.getStateAsync("PublicHolidyToday");
        parentAdapter.log.debug("PublicHolidyToday " + PublicHolidyToday.val);
        const MaintenanceActive = await parentAdapter.getStateAsync("MaintenanceActive");
        parentAdapter.log.debug("MaintenanceActive " + MaintenanceActive.val);


        await ChangeStatus("HeatingPeriodActive", "all", heatingPeriodActive.val);
        await ChangeStatus("Present", "all", Present.val);
        await ChangeStatus("VacationAbsent", "all", VacationAbsent.val);
        

        if (parentAdapter.config.UseFireplaceMode ) {
            const FireplaceModeActive = await parentAdapter.getStateAsync("FireplaceModeActive");
            parentAdapter.log.debug("FireplaceModeActive " + FireplaceModeActive.val);

            await ChangeStatus("FireplaceModeActive", "all", FireplaceModeActive.val);

            if (FireplaceModeActive.val) {
                StartTimer2ResetFireplaceMode();
            }
        }

        await ChangeStatus("HolidayPresent", "all", HolidayPresent.val);
        await ChangeStatus("GuestsPresent", "all", GuestsPresent.val);
        await ChangeStatus("PartyNow", "all", PartyNow.val);
        await ChangeStatus("PublicHolidyToday", "all", PublicHolidyToday.val);
        await ChangeStatus("MaintenanceActive", "all", MaintenanceActive.val);

    } catch (e) {
        parentAdapter.log.error("exception in CheckExternalStates [" + e + "]");
    }
    parentAdapter.log.info("checking external states done");
}

//*******************************************************************
//
async function GetAllCurrentProfilePoint() {
    parentAdapter.log.info("calculate current profile point for all rooms");

    const currentProfile = await GetCurrentProfile();

    for (let room = 0; room < Rooms.length; room++) {
        await GetCurrentProfilePoint(Rooms[room], currentProfile);
        await ChangeStatus("ProfilPoint", Rooms[room].Name, -99);
    }
}

async function GetCurrentProfilePoint(room, currentProfile) {

    try {
        if (parseInt(parentAdapter.config.ProfileType, 10) === 1) {
            await GetCurrentProfilePointType1(room, currentProfile);
        } else if (parseInt(parentAdapter.config.ProfileType, 10) === 2) {
            await GetCurrentProfilePointType2(room, currentProfile);
        } else if (parseInt(parentAdapter.config.ProfileType, 10) === 3) {
            await GetCurrentProfilePointType3(room, currentProfile);
        } else {
            parentAdapter.log.warn("GetCurrentProfilePoint: unknown profile type " + parentAdapter.config.ProfileType);
        }
    } catch (e) {
        parentAdapter.log.error("exception in GetCurrentProfilePoint [" + e + "] " + JSON.stringify(room) + " " + currentProfile);
    }
}

async function GetCurrentProfilePointType1(room, currentProfile) {
    parentAdapter.log.info("start calculate current profile point for profile type 1 (Mo - Su)");

    const now = new Date();

    const id = "Profiles." + currentProfile + "." + room.Name + ".Mo-Su.Periods.1.time";
    const firstTimeVal = await parentAdapter.getStateAsync(id);

    if (firstTimeVal != null) {
        const firstTime = firstTimeVal.val.split(":");

        if (firstTime.length >= 2) {
            //check current time before first profile point of the day
            if (now.getHours() < parseInt(firstTime[0])
                || (now.getHours() == parseInt(firstTime[0]) && now.getMinutes() < parseInt(firstTime[1]))) {

                now.setDate(now.getDate() - 1);
                now.setHours(23);
                now.setMinutes(59);
                parentAdapter.log.debug("last profile point from yesterday used");
            }

            for (let period = 1; period <= parseInt(parentAdapter.config.NumberOfPeriods); period++) {
                const id = "Profiles." + currentProfile + "." + room.Name + ".Mo-Su.Periods." + period;
                const nextTimeVal = await parentAdapter.getStateAsync(id + ".time");
                const nextTempVal = await parentAdapter.getStateAsync(id + ".Temperature");

                if (nextTimeVal != null && nextTempVal != null) {
                    const nextTime = nextTimeVal.val.split(":");

                    if (nextTime.length >= 2) {

                        if (now.getHours() > parseInt(nextTime[0])
                            || (now.getHours() == parseInt(nextTime[0]) && now.getMinutes() > parseInt(nextTime[1]))) {

                            room.ActiveTimeSlot = period;

                            room.CurrentTimePeriodTime = ("0" + nextTime[0]).slice(-2) + ":" + ("0" + nextTime[1]).slice(-2);
                            room.CurrentTimePeriodFull = "Period " + period + " " + room.CurrentTimePeriodTime;
                            room.CurrentTimePeriod = period;
                            room.CurrentProfileTarget = Check4ValidTemperature(parentAdapter, nextTempVal.val);
                        }
                    } else {
                        parentAdapter.log.warn(room.Name + " GetCurrentProfilePointType1: invalid time setting profile point " + period + " (" + nextTimeVal.val + ")");
                    }
                } else {
                    parentAdapter.log.warn(room.Name + " GetCurrentProfilePointType1: profile point " + id + " not found");
                }
            }
            parentAdapter.log.debug(room.Name + " found profile point at " + room.CurrentTimePeriodFull + " with " + room.CurrentProfileTarget);
        } else {
            parentAdapter.log.warn(room.Name + " GetCurrentProfilePointType1: invalid time setting profile point 1 (" + firstTimeVal.val + ")");
        }
    } else {
        parentAdapter.log.warn(room.Name + " GetCurrentProfilePointType1: first profile point time value not found " + id);
    }

}

async function GetCurrentProfilePointType2(room, currentProfile) {
    parentAdapter.log.info("start calculate current profile point for profile type 2 (Mo-Fr / Sa - Su)");

    const now = new Date();
    const day = now.getDay();
    let profilePart = "";
    if (day > 0 && day < 6) {
        profilePart = "Mo-Fr";
    } else {
        profilePart = "Sa-Su";
    }

    if (profilePart == "Mo-Fr" && room.PublicHolidyToday && parentAdapter.config.PublicHolidayLikeSunday === true) {
        profilePart = "Sa-Su";
        parentAdapter.log.debug("week end profile used for public holiday");
    } else if (profilePart == "Mo-Fr" && room.HolidayPresent && parentAdapter.config.HolidayPresentLikeSunday === true) {
        profilePart = "Sa-Su";
        parentAdapter.log.debug("week end profile used for holiday at home");
    }

    const id = "Profiles." + currentProfile + "." + room.Name + "." + profilePart + ".Periods.1.time";
    const firstTimeVal = await parentAdapter.getStateAsync(id);

    //Profiles.1.Wohnzimmer.Mo-Fr.1.time
    //Profiles.1.Wohnzimmer.Mo-Fr.Periods.1.time

    if (firstTimeVal != null) {
        const firstTime = firstTimeVal.val.split(":");

        if (firstTime.length >= 2) {
            //check current time before first profile point of the day
            if (now.getHours() < parseInt(firstTime[0])
                || (now.getHours() == parseInt(firstTime[0]) && now.getMinutes() < parseInt(firstTime[1]))) {

                now.setDate(now.getDate() - 1);
                now.setHours(23);
                now.setMinutes(59);
                if (day == 1) {
                    profilePart = "Sa-Su"; //we need last profile point from sunday
                    parentAdapter.log.debug("last profile point from weekend used");
                } else {
                    parentAdapter.log.debug("last profile point from yesterday used");
                }
            }

            for (let period = 1; period <= parseInt(parentAdapter.config.NumberOfPeriods); period++) {
                const id = "Profiles." + currentProfile + "." + room.Name + "." + profilePart + ".Periods." + period;

                //heatingcontrol.0.Profiles.1.Wohnzimmer.Mo-Fr.Periods.1.time
                const nextTimeVal = await parentAdapter.getStateAsync(id + ".time");
                const nextTempVal = await parentAdapter.getStateAsync(id + ".Temperature");

                if (nextTimeVal != null && nextTempVal != null) {
                    const nextTime = nextTimeVal.val.split(":");

                    if (nextTime.length >= 2) {

                        if (now.getHours() > parseInt(nextTime[0])
                            || (now.getHours() == parseInt(nextTime[0]) && now.getMinutes() > parseInt(nextTime[1]))) {

                            room.ActiveTimeSlot = period;

                            room.CurrentTimePeriodTime = ("0" + nextTime[0]).slice(-2) + ":" + ("0" + nextTime[1]).slice(-2);
                            room.CurrentTimePeriodFull = "Period " + period + " " + room.CurrentTimePeriodTime;

                            if (profilePart == "Mo-Fr") {
                                room.CurrentTimePeriod = period;
                            } else {
                                //room.CurrentTimePeriod = parseInt(parentAdapter.config.NumberOfPeriods) + period;
                                room.CurrentTimePeriod = NumberOfPeriodsinVis + period;
                            }
                            room.CurrentProfileTarget = Check4ValidTemperature(parentAdapter, nextTempVal.val);
                        }
                    } else {
                        parentAdapter.log.warn(room.Name + " GetCurrentProfilePointType2: invalid time setting profile point " + period + " (" + nextTimeVal.val + ")");
                    }
                } else {
                    parentAdapter.log.warn(room.Name + " GetCurrentProfilePointType2: profile point " + id + " not found");
                }
            }
            parentAdapter.log.debug(room.Name + " found profile point at " + room.CurrentTimePeriodFull + " with " + room.CurrentProfileTarget);
        } else {
            parentAdapter.log.warn(room.Name + " GetCurrentProfilePointType2: invalid time setting profile point 1 (" + firstTimeVal.val + ")");
        }
    } else {
        parentAdapter.log.warn(room.Name + " GetCurrentProfilePointType2: first profile point time value not found " + id);
    }
}

async function GetCurrentProfilePointType3(room, currentProfile) {
    parentAdapter.log.info("start calculate current profile point for profile type 3 (every day)");

    const now = new Date();
    let day = now.getDay();
    let profilePart = "";

    if (day == 1) {
        profilePart = "Mon";
    } else if (day == 2) {
        profilePart = "Tue";
    } else if (day == 3) {
        profilePart = "Wed";
    } else if (day == 4) {
        profilePart = "Thu";
    } else if (day == 5) {
        profilePart = "Fri";
    } else if (day == 6) {
        profilePart = "Sat";
    } else if (day == 0) {
        profilePart = "Sun";
    }
 

    if ( room.PublicHolidyToday && parentAdapter.config.PublicHolidayLikeSunday === true) {
        profilePart = "Sun";
        day = 0;
        parentAdapter.log.debug("sunday profile used for public holiday");
    } else if (room.HolidayPresent && parentAdapter.config.HolidayPresentLikeSunday === true) {
        profilePart = "Sun";
        day = 0;
        parentAdapter.log.debug("sunday profile used for holiday at home");
    }

    const id = "Profiles." + currentProfile + "." + room.Name + "." + profilePart + ".Periods.1.time";
    const firstTimeVal = await parentAdapter.getStateAsync(id);

    if (firstTimeVal != null) {
        const firstTime = firstTimeVal.val.split(":");

        if (firstTime.length >= 2) {
            //check current time before first profile point of the day
            if (now.getHours() < parseInt(firstTime[0])
                || (now.getHours() == parseInt(firstTime[0]) && now.getMinutes() < parseInt(firstTime[1]))) {

                now.setDate(now.getDate() - 1);
                now.setHours(23);
                now.setMinutes(59);
                if (day == 1) {
                    profilePart = "Sun"; //we need last profile point from sunday
                    parentAdapter.log.debug("last profile point from sunday used");
                } else if (day == 2) {
                    profilePart = "Mon"; //we need last profile point from monday
                    parentAdapter.log.debug("last profile point from monday used");
                } else if (day == 3) {
                    profilePart = "Thu"; //we need last profile point from thusday
                    parentAdapter.log.debug("last profile point from thusday used");
                } else if (day == 4) {
                    profilePart = "Wed"; //we need last profile point from wednesday
                    parentAdapter.log.debug("last profile point from wednesday used");
                } else if (day == 5) {
                    profilePart = "Thu"; //we need last profile point from thursday
                    parentAdapter.log.debug("last profile point from thursday used");
                } else if (day == 6) {
                    profilePart = "Fri"; //we need last profile point from friday
                    parentAdapter.log.debug("last profile point from friday used");
                } else if (day == 0) {
                    profilePart = "Sat"; //we need last profile point from saturday
                    parentAdapter.log.debug("last profile point from saturday used");
                }
                
                
            }

            for (let period = 1; period <= parseInt(parentAdapter.config.NumberOfPeriods); period++) {
                const id = "Profiles." + currentProfile + "." + room.Name + "." + profilePart + ".Periods." + period;
                const nextTimeVal = await parentAdapter.getStateAsync(id + ".time");
                const nextTempVal = await parentAdapter.getStateAsync(id + ".Temperature");

                if (nextTimeVal != null && nextTempVal != null) {
                    const nextTime = nextTimeVal.val.split(":");

                    if (nextTime.length >= 2) {

                        if (now.getHours() > parseInt(nextTime[0])
                            || (now.getHours() == parseInt(nextTime[0]) && now.getMinutes() > parseInt(nextTime[1]))) {

                            room.ActiveTimeSlot = period;

                            room.CurrentTimePeriodTime = ("0" + nextTime[0]).slice(-2) + ":" + ("0" + nextTime[1]).slice(-2);
                            room.CurrentTimePeriodFull = "Period " + period + " " + room.CurrentTimePeriodTime;

                            
                            if (day > 0 && day < 7) {
                                //room.CurrentTimePeriod = (day - 1) * parseInt(parentAdapter.config.NumberOfPeriods) + period;
                                room.CurrentTimePeriod = (day - 1) * NumberOfPeriodsinVis + period;
                            } else {
                                //room.CurrentTimePeriod = 6 * parseInt(parentAdapter.config.NumberOfPeriods) + period;
                                room.CurrentTimePeriod = 6 * NumberOfPeriodsinVis + period;
                            }
                            room.CurrentProfileTarget = Check4ValidTemperature(parentAdapter, nextTempVal.val);
                        }
                    } else {
                        parentAdapter.log.warn(room.Name + " GetCurrentProfilePointType3: invalid time setting profile point " + period + " (" + nextTimeVal.val + ")");
                    }
                } else {
                    parentAdapter.log.warn(room.Name + " GetCurrentProfilePointType3: profile point " + id + " not found");
                }
            }
            parentAdapter.log.debug(room.Name + " found profile point at " + room.CurrentTimePeriodFull + " with " + room.CurrentProfileTarget);
        } else {
            parentAdapter.log.warn(room.Name + " GetCurrentProfilePointType3: invalid time setting profile point 1 (" + firstTimeVal.val + ")");
        }
    } else {
        parentAdapter.log.warn(room.Name + " GetCurrentProfilePointType3: first profile point time value not found " + id);
    }

}


async function CalculateTempOffset(room, value) {


    if (room.State == "starting" || room.State == "no heating") {
        //do nothing 
        parentAdapter.log.debug("CalculateTempOffset: nothing to do...");

        return;
    }

    parentAdapter.log.debug("calculate temp offset for " + room.Name + " old value is " + room.TempOffset + ", got value " + JSON.stringify(value) + " in " + room.State);

    const LastUpdateExtSensor = new Date(value.ts);
    const datestringExt = ("0" + LastUpdateExtSensor.getDate()).slice(-2) + "." + ("0" + (LastUpdateExtSensor.getMonth() + 1)).slice(-2) + "." +
        LastUpdateExtSensor.getFullYear() + " " + ("0" + LastUpdateExtSensor.getHours()).slice(-2) + ":" + ("0" + LastUpdateExtSensor.getMinutes()).slice(-2) + ":" + ("0" + LastUpdateExtSensor.getSeconds()).slice(-2);

    parentAdapter.log.debug("got " + value.val + " from ext_Sensor LastUpdate " + datestringExt);
    room.CurrentTemperatureAddSensor = value.val;
    let datestringInt = "";
    let timediff = 0;

    //get current value from thermostat
    const thermostats = findObjectsByKey(Thermostats, "room", room.Name);
    const MaxTimeDiff = parentAdapter.config.AddTempSensorsMaxTimeDiff;


    let CurrentTemp = 0.0;

    if (thermostats != null) {

        let LastUpdateSensor = null;
        let validTemps = 0;
        for (let d = 0; d < thermostats.length; d++) {

            const current = await parentAdapter.getForeignStateAsync(thermostats[d].OID_Current);

            if (current !== undefined && current != null) {
                
                LastUpdateSensor = new Date(current.ts);
                datestringInt = ("0" + LastUpdateSensor.getDate()).slice(-2) + "." + ("0" + (LastUpdateSensor.getMonth() + 1)).slice(-2) + "." +
                    LastUpdateSensor.getFullYear() + " " + ("0" + LastUpdateSensor.getHours()).slice(-2) + ":" + ("0" + LastUpdateSensor.getMinutes()).slice(-2) + ":" + ("0" + LastUpdateSensor.getSeconds()).slice(-2);

                parentAdapter.log.debug("got " + current.val + " from " + thermostats[d].OID_Current + " LastUpdate " + datestringInt );

                //timediff in min
                timediff = (LastUpdateExtSensor - LastUpdateSensor) / 1000 / 60;

                parentAdapter.log.debug("time diff " + timediff);

                if (MaxTimeDiff == 0 || Math.abs(timediff) < MaxTimeDiff) {
                    parentAdapter.log.debug("use value " + current.val + " " + CurrentTemp + " " + validTemps  );
                    
                    CurrentTemp += parseFloat(current.val);
                    validTemps++;
                } else {
                    parentAdapter.log.debug("!!! don't use value, timediff too long  " + timediff + "min");
                }
            } else {
                parentAdapter.log.error("could not read " + thermostats[d].OID_Current);
            }
        }

        if (validTemps > 0) {

            //calculate average
            CurrentTemp = CurrentTemp / validTemps;
            //CurrentTemp=(23,7+22,6)/2=23,15

            //calc diff to value from add temp sensor
            const tempDiff = CurrentTemp - value.val;

            parentAdapter.log.debug("tempdiff: " + CurrentTemp + " - " + value.val + " = " + tempDiff);

            //calc avarage for offset
            if (room.TempOffsetData.length > 20) {
                room.TempOffsetData.shift();
            }

            room.TempOffsetData.push({
                value: tempDiff
            });

            const weight = 30;
            let tempValue = weight * room.TempOffset;

            for (let n = 0; n < room.TempOffsetData.length; n++) {
                tempValue += room.TempOffsetData[n].value;
            }

            const ctr = weight + room.TempOffsetData.length;
            //offset auf 0,5°C runden, siehe issue #289
            room.TempOffset = round(tempValue / ctr, 0.5);
            parentAdapter.log.debug("TempOffset calc " + tempValue + " / " + ctr + " = " + room.TempOffset);

            const OffsetLimit = parseInt(parentAdapter.config.AddTempSensorsTempLimit);

            if (OffsetLimit > 0) {
                if (room.TempOffset > OffsetLimit) {
                    room.TempOffset = OffsetLimit;
                    parentAdapter.log.debug("TempOffset limit used " + room.TempOffset);
                }
                if (room.TempOffset < -1 * OffsetLimit) {
                    room.TempOffset = -1 * OffsetLimit;
                    parentAdapter.log.debug("TempOffset limit used " + room.TempOffset);
                }
            }


            //old version, too much changing
            //room.TempOffset = round((room.TempOffset + tempDiff) / 2, 0.5);

            //debug only:
            parentAdapter.log.debug("TempOffset " + room.Name);
            parentAdapter.log.debug("(avg) Ist-Temperatur am Thermostat " + CurrentTemp);
            parentAdapter.log.debug("Ist-Temperatur am zusätzl. Sensor " + value.val);
            parentAdapter.log.debug("tempDiff " + tempDiff);
            parentAdapter.log.debug("(avg) TempOffset " + room.TempOffset);


            //heatingcontrol.0.Rooms.Test.TemperatureOffset
            await parentAdapter.setStateAsync("Rooms." + room.Name + ".TemperatureOffset", { val: room.TempOffset, ack: true });

            parentAdapter.log.debug("new temp offset for " + room.Name + " is " + room.TempOffset);

        } else {
            parentAdapter.log.warn(room.Name + " Temp offset calculation skipped, time difference too long, ext Sensor update " + datestringExt + " int. Sensor update " + datestringInt + " = timediff " + timediff);
        }

    } else {
        parentAdapter.log.error("none thermostat found in " + room.Name); 
    }

    
}

//*******************************************************************
//
function GetNumberOfActiveRooms() {

    return Rooms.length;
}

function GetRoomData(id) {

    return Rooms[id];
}


function GetAllRoomData() {

    return Rooms;
}

//*******************************************************************
//
async function HandleActorsWithoutThermostat() {

    try {

        if (parentAdapter.config.UseActors && ActorsWithoutThermostat.length > 0) {
            parentAdapter.log.debug("Setting Actors without Thermostat " + JSON.stringify(ActorsWithoutThermostat));

            if (parseInt(parentAdapter.config.UseActorsIfNoThermostat) > 1) {
                let target = false;
                if (parseInt(parentAdapter.config.UseActorsIfNoThermostat) === 2) {
                    target = false;
                } else if (parseInt(parentAdapter.config.UseActorsIfNoThermostat) === 3) {
                    target = true;
                }

                
                parentAdapter.log.debug("HandleActorsGeneral: setting actuators without thermostats to " + target);

                for (let d = 0; d < ActorsWithoutThermostat.length; d++) {

                    //set status
                    const roomName = ActorsWithoutThermostat[d].room;
                    const room = findObjectByKey(Rooms, "Name", roomName);
                    if (room != null) {
                        room.ActorState = target;
                    } else {
                        parentAdapter.log.error("HandleActorsGeneral: room not found " + roomName + " " + JSON.stringify(room));
                    }



                    const OID = Actors[ActorsWithoutThermostat[d].id].OID;
                    parentAdapter.log.debug("HandleActorsWithoutThermostat OID " + OID); 

                    //prüfen, ob state schon target entspricht
                    const currentState = await parentAdapter.getForeignStateAsync(OID);

                    if (currentState != null &&  currentState !== undefined) {
                        if (currentState.val !== target) {
                            parentAdapter.log.debug(" actor " + OID + " to " + target);

                            //await parentAdapter.setForeignStateAsync(OID, target);
                            await setActorState(Actors[ActorsWithoutThermostat[d].id], target);
                        } else {
                            parentAdapter.log.debug(" actor " + OID + " nothing to do");
                        }
                    } else {
                        parentAdapter.log.debug(" actor " + OID + " to " + target + " current undefined");
                        //await parentAdapter.setForeignStateAsync(OID, target);
                        await setActorState(Actors[ActorsWithoutThermostat[d].id], target);
                    }
                }
            } else {
                parentAdapter.log.debug("HandleActorsWithoutThermostat: nothing to do, UseActorsIfNoThermostat= " + parseInt(parentAdapter.config.UseActorsIfNoThermostat));
            }
        }
    } catch (e) {
        parentAdapter.log.error("exception in HandleActorsWithoutThermostat [" + e + "]");
    }
}


//=================== used for Pittini Vis

let OpenWindowRoomCount = 0;
let WindowClosedImg = "/vis.0/HeatingControl/images/fts_window_1w.svg";
let WindowOpenImg = "/vis.0/HeatingControl/images/fts_window_1w_open.svg";


async function CreateWindowStatesTable() { // Erzeugt List mit Räumen und Fensterstatus
    parentAdapter.log.debug("CreateWindowStatesTable called ");

    if (parentAdapter.config.PittiniPathImageWindowOpen.length != null && parentAdapter.config.PittiniPathImageWindowOpen.length > 0) {
        parentAdapter.log.debug("set image path " + parentAdapter.config.PittiniPathImageWindowOpen);
        WindowOpenImg = parentAdapter.config.PittiniPathImageWindowOpen;
    }
    if (parentAdapter.config.PittiniPathImageWindowClosed != null && parentAdapter.config.PittiniPathImageWindowClosed.length > 0) {
        parentAdapter.log.debug("set image path " + parentAdapter.config.PittiniPathImageWindowClosed);
        WindowClosedImg = parentAdapter.config.PittiniPathImageWindowClosed;
    }

    try {
        let HtmlTable = "";
        let HtmlTableVis2 = [];
        OpenWindowRoomCount = 0;

        if (parentAdapter.config.VisUseSimple) {

            HtmlTable += "<div>";
            HtmlTable += "<table>";
            HtmlTable += "<tr>";
            HtmlTable += "<th> " + GetTranslation(parentAdapter, "room", SystemLanguage) + " </th > ";
            HtmlTable += "<th> " + GetTranslation(parentAdapter, "status", SystemLanguage) + " </th>";
            HtmlTable += "<th> " + GetTranslation(parentAdapter, "since", SystemLanguage) + " </th>";
            HtmlTable += "</tr>";


            

            for (let room = 0; room < Rooms.length; room++) {
                
                if (Rooms[room].hasWindowSensors) {

                    HtmlTable += "<tr>";
                    HtmlTable += "<td>" + Rooms[room].Name + " </td>";

                    if (Rooms[room].WindowIsOpen) {
                        HtmlTable += "<td> " + GetTranslation(parentAdapter, "opened", SystemLanguage) + " </td>";
                        OpenWindowRoomCount++;
                    } else {
                        HtmlTable += "<td> " + GetTranslation(parentAdapter, "closed", SystemLanguage) + " </td>";
                    }
                    HtmlTable += "<td>" + Rooms[room].WindowIsOpenChanged + "</td>";

                    HtmlTable += "</tr>";
                }
               
            }
            HtmlTable += "</table>";
            HtmlTable += "</div>";
            

        } else {

           

            for (let room = 0; room < Rooms.length; room++) {
               

                if (Rooms[room].hasWindowSensors) {

                    HtmlTableVis2.push({
                        room: Rooms[room].Name,
                        sinceText: GetTranslation(parentAdapter, "since", SystemLanguage),
                        icon: Rooms[room].WindowIsOpen ? WindowOpenImg : WindowClosedImg,
                        changed: Rooms[room].WindowIsOpenChanged,
                        isOpen: Rooms[room].WindowIsOpen
                    });


                    if (Rooms[room].WindowIsOpen) {
                        HtmlTable = HtmlTable + '<div class="mdui-listitem mdui-center-v mdui-red-bg" style="height:48px;"> <img height=40px src="' + WindowOpenImg + '"&nbsp</img> ';
                        OpenWindowRoomCount++;
                    } else {
                        HtmlTable = HtmlTable + '<div class="mdui-listitem mdui-center-v" style="height:48px;"> <img height=40px src="' + WindowClosedImg + '"&nbsp</img> ';
                    }
                    HtmlTable = HtmlTable + '<div class="mdui-label">' + Rooms[room].Name + '<div class="mdui-subtitle">' + GetTranslation(parentAdapter, "since", SystemLanguage) + " " + Rooms[room].WindowIsOpenChanged + "</div></div></div>";
                }
            }

            
        }
        await parentAdapter.setStateAsync("vis.WindowStatesHtmlTable", { ack: true, val: HtmlTable });
        await parentAdapter.setStateAsync("vis.WindowStatesHtmlTableVis2", { ack: true, val: JSON.stringify(HtmlTableVis2) });
        await parentAdapter.setStateAsync("vis.OpenWindowRoomCount", { ack: true, val: OpenWindowRoomCount });
        //parentAdapter.log.debug(HtmlTable);
    } catch (e) {
        parentAdapter.log.error("exception in CreateWindowStatesTable [" + e + "]");
    }
    parentAdapter.log.debug("CreateWindowStatesTable done ");
}


function SetNewRoomState(room, newState) {
    if (room.isActive || newState === "no heating") {

        if (newState != room.State) {
            AddStatusToLog(room, newState);
            parentAdapter.log.debug(room.Name + ": set new state " + newState);
            room.PreviousState = room.State;
            room.State = newState;
        }
    } else {
        parentAdapter.log.debug(room.Name + ": cannot set new state " + newState + " because room is not active");
    }

}

module.exports = {
    CreateDatabase,
    GetUsedRooms,
    ChangeStatus,
    SubscribeDevices,
    UnsubscribeDevices,
    CheckStateChangeDevice,
    StartStatemachine,
    GetCurrentProfile,
    GetNumberOfActiveRooms,
    GetRoomData,
    GetAllRoomData
};