/**
 * rewebrtc-server project
 *
 * Tho Q Luong <thoqbk@gmail.com>
 * Feb 12, 2017
 */


var OneSignal = require('onesignal-node');

let uid = require('uid');
let moment = require('moment')

var express = require('express');
var app = express();
var path = require('path');
var fs = require('fs');
var open = require('open');
var httpsOptions = {
  key: fs.readFileSync('./fake-keys/privatekey.pem'),
  cert: fs.readFileSync('./fake-keys/certificate.pem')
};
let isLocal = process.env.PORT == null;
var serverPort = (process.env.PORT || 4443);
var server = null;
if (isLocal) {
  server = require('http').createServer(app);
  //server = require('https').createServer(httpsOptions, app);
} else {
  server = require('http').createServer(app);
}
var io = require('socket.io')(server);

let socketIdToNames = {};
let socketIDtoPhoneNo = {};
let currentCallingRoom = {}
// current phone number that send call request to this number
let CurrentReqPhoneNumberto = {};
let CurrentReqPhoneNumberfrom = {};


//Mess list
let MessList = {};



//OneSignal Config
var myOneSignalClient = new OneSignal.Client({
  userAuthKey: 'XXXXXX',
  app: { appAuthKey: 'NzU0ZTJkNzQtMTE2Ni00OWM2LTkxNmQtNWE5ZjU0NjM4Zjg3', appId: '0fa573c7-d772-4605-affd-77d120842f1d' }
});




//------------------------------------------------------------------------------
//  Serving static files
app.get('/', function (req, res) {
  console.log('get /');
  res.sendFile(__dirname + '/index.html');
});

app.get('/draw', function (req, res) {
  console.log('get /');
  res.sendFile(__dirname + '/draw.html');
});

app.use('/style', express.static(path.join(__dirname, 'style')));
app.use('/script', express.static(path.join(__dirname, 'script')));
app.use('/image', express.static(path.join(__dirname, 'image')));

server.listen(serverPort, function () {
  console.log('Rewebrtc-server is up and running at %s port', serverPort);
  if (isLocal) {
    open('http://localhost:' + serverPort)
  }
});

//------------------------------------------------------------------------------

//OneSignal Functions
function sendNotification() {
  // we need to create a notification to send    
  var firstNotification = new OneSignal.Notification({
    contents: {
      en: "Test notification",
      tr: "Test mesajı"
    }
  });

  // set target users    
  firstNotification.postBody["included_segments"] = ["Active Users"];
  firstNotification.postBody["excluded_segments"] = ["Banned Users"];

  // set notification parameters    
  firstNotification.postBody["data"] = { "abc": "123", "foo": "bar" };
  

  // send this notification to All Users except Inactive ones    
  myOneSignalClient.sendNotification(firstNotification, function (err, httpResponse, data) {
    if (err) {
      console.log('Something went wrong...');
    } else {
      console.log(data, httpResponse.statusCode);
    }
  });
}

//////////////////////////////////////////
//  WebRTC Signaling
function socketIdsInRoom(roomId) {
  var socketIds = io.nsps['/'].adapter.rooms[roomId];
  if (socketIds) {
    var collection = [];
    for (var key in socketIds) {
      collection.push(key);
    }
    return collection;
  } else {
    return [];
  }
}

//delete all variable that held data of the call from A to B

//A call B => CurrentReqPhoneNumberto[B]=A    CurrentReqPhoneNumberfrom[A]=B
function deleteCallTrace(numberA, numberB) {
  delete CurrentReqPhoneNumberfrom[numberA];
  delete CurrentReqPhoneNumberto[numberB];




  delete currentCallingRoom[numberA];
  delete currentCallingRoom[numberB];

}

io.on('connection', function (socket) {
  console.log('Connection');
  socket.on('disconnect', function () {
    console.log('Disconnect');
    delete CurrentReqPhoneNumberto[socketIDtoPhoneNo[socket.id]];
    delete CurrentReqPhoneNumberfrom[socketIDtoPhoneNo[socket.id]];
    delete socketIdToNames[socket.id];
    delete currentCallingRoom[socketIDtoPhoneNo[socket.id]]
    delete socketIDtoPhoneNo[socket.id]
    if (socket.room) {
      var room = socket.room;
      io.to(room).emit('leave', socket.id);
      socket.leave(room);
    }
  });

  /**
   * Callback: list of {socketId, name: name of user}
   */
  socket.on('join', function (joinData, callback) { //Join room
    let roomId = joinData.roomId;
    let name = joinData.name;
    socket.join(roomId);
    socket.room = roomId;
    socketIdToNames[socket.id] = name;
    var socketIds = socketIdsInRoom(roomId);
    let friends = socketIds.map((socketId) => {
      return {
        socketId: socketId,
        name: socketIdToNames[socketId]
      }
    }).filter((friend) => friend.socketId != socket.id);
    callback(friends);
    //broadcast
    friends.forEach((friend) => {
      io.sockets.connected[friend.socketId].emit("join", {
        socketId: socket.id, name
      });
    });
    console.log('Join: ', joinData);
  });


  //register room
  socket.on('register', function (data) {
    socket.join(data.phoneNumber);
    socketIDtoPhoneNo[socket.id] = data.phoneNumber;
    console.log("register", socketIDtoPhoneNo[socket.id])

    sendNotification();

    //send unreceive mess to this phone no
    if (MessList[data.phoneNumber])
      io.to(data.phoneNumber).emit("MessComming", { multiMessWaiting: true, MessList: MessList[data.phoneNumber] })


  })


  //unregister room
  socket.on('unregister', function () {
    console.log("unregister", socketIDtoPhoneNo[socket.id])
    socket.leave(socketIDtoPhoneNo[socket.id]);
    delete socketIDtoPhoneNo[socket.id];
  })

  //receive call request
  socket.on('requestCall', function (data) {

    //if there is no current phone number request call to this number or this number not in any call
    console.log(CurrentReqPhoneNumberto[data.phoneNumber], currentCallingRoom[data.phoneNumber])
    if (currentCallingRoom[data.phoneNumber] == null) {
      if (CurrentReqPhoneNumberto[data.phoneNumber] == null) {
        if (CurrentReqPhoneNumberfrom[data.phoneNumber] == null) {
          io.to(data.phoneNumber).emit('receiveCall', { phoneNumber: socketIDtoPhoneNo[socket.id] });
          CurrentReqPhoneNumberto[data.phoneNumber] = socketIDtoPhoneNo[socket.id];
          CurrentReqPhoneNumberfrom[socketIDtoPhoneNo[socket.id]] = data.phoneNumber;
          console.log(CurrentReqPhoneNumberto[data.phoneNumber], 'call', data.phoneNumber)
        }
      }
    }

  })

  socket.on('hangup', function () {

    io.to(currentCallingRoom[socketIDtoPhoneNo[socket.id]]).emit('leave', socket.id);



    let roomName = currentCallingRoom[socketIDtoPhoneNo[socket.id]];

    delete CurrentReqPhoneNumberto[socketIDtoPhoneNo[socket.id]];
    delete CurrentReqPhoneNumberfrom[socketIDtoPhoneNo[socket.id]];
    delete currentCallingRoom[socketIDtoPhoneNo[socket.id]];

    socket.leave(roomName);

  })

  socket.on('decline', function () {
    console.log("Declined");
    io.to(socketIDtoPhoneNo[socket.id]).emit('Callcancelled');
    if (CurrentReqPhoneNumberfrom[socketIDtoPhoneNo[socket.id]]) {
      io.to(CurrentReqPhoneNumberfrom[socketIDtoPhoneNo[socket.id]]).emit('Callcancelled');
      deleteCallTrace(socketIDtoPhoneNo[socket.id], CurrentReqPhoneNumberfrom[socketIDtoPhoneNo[socket.id]])

    }
    if (CurrentReqPhoneNumberto[socketIDtoPhoneNo[socket.id]]) {
      io.to(CurrentReqPhoneNumberto[socketIDtoPhoneNo[socket.id]]).emit('Callcancelled');
      deleteCallTrace(CurrentReqPhoneNumberto[socketIDtoPhoneNo[socket.id]], socketIDtoPhoneNo[socket.id])
    }



  })





  //accept call request
  socket.on('acceptCall', function () {
    let roomName = CurrentReqPhoneNumberto[socketIDtoPhoneNo[socket.id]] + '_to_' + socketIDtoPhoneNo[socket.id];
    currentCallingRoom[socketIDtoPhoneNo[socket.id]] = roomName;
    currentCallingRoom[CurrentReqPhoneNumberto[socketIDtoPhoneNo[socket.id]]] = roomName;


    io.to(CurrentReqPhoneNumberto[socketIDtoPhoneNo[socket.id]]).emit('CallAccepted', { roomName });
    io.to(socketIDtoPhoneNo[socket.id]).emit('CallAccepted', { roomName });

    delete CurrentReqPhoneNumberto[socketIDtoPhoneNo[socket.id]];
    delete CurrentReqPhoneNumberfrom[socketIDtoPhoneNo[socket.id]];

  })


  socket.on('exchange', function (data) {
    console.log('exchange', data);
    data.from = socket.id;
    var to = io.sockets.connected[data.to];
    to.emit('exchange', data);
  });

  socket.on("count", function (roomId, callback) {
    var socketIds = socketIdsInRoom(roomId);
    callback(socketIds.length);
  });



  //-------------- MESS Function
  socket.on("MessSend", function (data) {
    let t_id = uid();
    if (MessList[data.toNo]) {
      let thereWasMessfromThisNumbe = false;
      MessList[data.toNo].map((item) => {
        if (item.withUserPhone != data.fromNo) return item;
        thereWasMessfromThisNumbe = true;
        item.messages.push({
          id: t_id,
          type: 'in',
          time: moment().format(),
          text: data.mess
        })
      })
      if (!thereWasMessfromThisNumbe) {
        MessList[data.toNo].push({
          withUserPhone: data.fromNo,
          messages: [{
            id: t_id,
            type: 'in',
            time: moment().format(),
            text: data.mess
          }
          ]
        })
      }
    }
    else {
      MessList[data.toNo] = [];
      MessList[data.toNo].push({
        withUserPhone: data.fromNo,
        messages: [
          {
            id: t_id,
            type: 'in',
            time: moment().format(),
            text: data.mess
          }
        ]
      })
    }
    let messItemSent = {
      withUserPhone: data.toNo,
      messages: [
        {
          id: t_id,
          type: 'out',
          time: moment().format(),
          text: data.mess
        }
      ]
    }


    console.log(MessList)
    //emit mess to phone number
    io.to(data.toNo).emit("MessComming", { multiMessWaiting: false, fromNo: data.fromNo, MessList: MessList[data.toNo] })

    io.to(data.fromNo).emit("MessComming", { multiMessWaiting: false, toNo: data.toNo, MessSent: messItemSent })

  });

  //Client tell that mess saved, we should clear un receive messlist of this phone number
  socket.on("MessSaved", function () {
    delete MessList[socketIDtoPhoneNo[socket.id]];
    console.log("Delete messlist of ", socketIDtoPhoneNo[socket.id]);
  })


});







// // Order of call process  
// register: join a socket id in room name same as its number
// requestcall : send a call request to other number
// hang up : hang up a processing call
// decline: cancel an incomming or requesting  call 