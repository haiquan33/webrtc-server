/**
 * rewebrtc-server project
 *
 * Tho Q Luong <thoqbk@gmail.com>
 * Feb 12, 2017
 */

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
  //  server = require('https').createServer(httpsOptions, app);
  server = require('http').createServer(app);
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

});




// // Order of call process  
// register: join a socket id in room name same as its number
// requestcall : send a call request to other number
// hang up : hang up a processing call
// decline: cancel an incomming or requesting  call 