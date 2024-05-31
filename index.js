"use strict";

const RTCPeerConnection = (
  window.RTCPeerConnection ||
  window.webkitRTCPeerConnection ||
  window.mozRTCPeerConnection
).bind(window);

let peerConnection;
let sessionId;
let sessionClientAnswer;

let statsIntervalId;
let videoIsPlaying;
let lastBytesReceived;

const host = "";
const apiKey = "";

const videoElement = document.getElementById("video-element");
videoElement.setAttribute("playsinline", "");
const createStreamLabel = document.getElementById("create-stream-status-label");
const peerStatusLabel = document.getElementById("peer-status-label");
const iceStatusLabel = document.getElementById("ice-status-label");
const iceGatheringStatusLabel = document.getElementById(
  "ice-gathering-status-label"
);
const signalingStatusLabel = document.getElementById("signaling-status-label");
const streamingStatusLabel = document.getElementById("streaming-status-label");

const connectButton = document.getElementById("connect-button");
connectButton.onclick = async () => {
  if (peerConnection && peerConnection.connectionState === "connected") {
    return;
  }

  stopAllStreams();
  closePC();
  createStreamLabel.innerText = "creating...";
  createStreamLabel.className = "createStreamState-" + "creating";

  const sessionResponse = await fetch(`${host}/streams`, {
    method: "POST",
    headers: {
      "X-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agent_id: "",
    }),
  });
  const {
    session_id: newSessionId,
    offer: offer,
    ice_servers: iceServers,
  } = await sessionResponse.json();

  sessionId = newSessionId;

  try {
    sessionClientAnswer = await createPeerConnection(offer, iceServers);
  } catch (e) {
    console.log("error during streaming setup", e);
    stopAllStreams();
    closePC();
    return;
  }

  const sdpResponse = await fetch(`${host}/streams/sdp`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session_id: sessionId,
      answer: sessionClientAnswer,
    }),
  });

  createStreamLabel.innerText = "Done!";
  createStreamLabel.className = "createStreamState-" + "Done";
};

const startButton = document.getElementById("start-button");
startButton.onclick = async () => {
  if (
    peerConnection?.signalingState === "stable" ||
    peerConnection?.iceConnectionState === "connected"
  ) {
    const playResponse = await fetch(`${host}/streams/speakings`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_id: sessionId,
        text: "안녕하세요. 저는 브이몬스터의 이젤입니다. 잘 부탁드립니다.",
        backgroundColor: "#000000",
      }),
    });
  }
};

function onIceGatheringStateChange() {
  iceGatheringStatusLabel.innerText = peerConnection.iceGatheringState;
  iceGatheringStatusLabel.className =
    "iceGatheringState-" + peerConnection.iceGatheringState;
}

function onIceCandidate(event) {
  if (event.candidate) {
    fetch(`${host}/streams/ice-candidates`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_id: sessionId,
        candidate: event.candidate,
      }),
    })
      .then((response) => response.json())
      .then((data) => {})
      .catch((error) => console.error("Error:", error));
  }
}

function onIceConnectionStateChange() {
  iceStatusLabel.innerText = peerConnection.iceConnectionState;
  iceStatusLabel.className =
    "iceConnectionState-" + peerConnection.iceConnectionState;
  if (
    peerConnection.iceConnectionState === "failed" ||
    peerConnection.iceConnectionState === "closed"
  ) {
    stopAllStreams();
    closePC();
  }
}

function onConnectionStateChange() {
  peerStatusLabel.innerText = peerConnection.connectionState;
  peerStatusLabel.className =
    "peerConnectionState-" + peerConnection.connectionState;
}
function onSignalingStateChange() {
  signalingStatusLabel.innerText = peerConnection.signalingState;
  signalingStatusLabel.className =
    "signalingState-" + peerConnection.signalingState;
}

function onVideoStatusChange(videoIsPlaying, stream) {
  let status;
  if (videoIsPlaying) {
    status = "streaming";
    const remoteStream = stream;
    setVideoElement(remoteStream);
  } else {
    status = "empty";
    playIdleVideo();
  }
  streamingStatusLabel.innerText = status;
  streamingStatusLabel.className = "streamingState-" + status;
}

function onTrack(event) {
  if (!event.track) return;

  statsIntervalId = setInterval(async () => {
    const stats = await peerConnection.getStats(event.track);
    stats.forEach((report) => {
      if (report.type === "inbound-rtp" && report.mediaType === "video") {
        const videoStatusChanged =
          videoIsPlaying !== report.bytesReceived > lastBytesReceived;

        if (videoStatusChanged) {
          videoIsPlaying = report.bytesReceived > lastBytesReceived;
          onVideoStatusChange(videoIsPlaying, event.streams[0]);
        }
        lastBytesReceived = report.bytesReceived;
      }
    });
  }, 500);
}

async function createPeerConnection(offer, iceServers) {
  if (!peerConnection) {
    peerConnection = new RTCPeerConnection({ iceServers });
    peerConnection.addEventListener(
      "icegatheringstatechange",
      onIceGatheringStateChange,
      true
    );
    peerConnection.addEventListener("icecandidate", onIceCandidate, true);
    peerConnection.addEventListener(
      "iceconnectionstatechange",
      onIceConnectionStateChange,
      true
    );
    peerConnection.addEventListener(
      "connectionstatechange",
      onConnectionStateChange,
      true
    );
    peerConnection.addEventListener(
      "signalingstatechange",
      onSignalingStateChange,
      true
    );
    peerConnection.addEventListener(
      "icecandidateerror",
      onIceCandidateError,
      true
    );
    peerConnection.addEventListener(
      "negotiationneeded",
      onNegotiationNeeded,
      true
    );
    peerConnection.addEventListener("track", onTrack, true);
  }

  await peerConnection.setRemoteDescription(offer);
  const sessionClientAnswer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(sessionClientAnswer);
  return sessionClientAnswer;
}

const destroyButton = document.getElementById("destroy-button");
destroyButton.onclick = async () => {
  await fetch(`${host}/streams`, {
    method: "DELETE",
    headers: {
      "X-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session_id: sessionId,
    }),
  });

  stopAllStreams();
  closePC();
};

function setVideoElement(stream) {
  if (!stream) return;
  videoElement.srcObject = stream;
  videoElement.loop = false;

  if (videoElement.paused) {
    videoElement
      .play()
      .then((_) => {})
      .catch((e) => {});
  }
}

function playIdleVideo() {
  videoElement.srcObject = undefined;
  videoElement.src = "jisoo_idle.mp4";
  videoElement.loop = true;
}

function stopAllStreams() {
  if (videoElement.srcObject) {
    console.log("stopping video streams");
    videoElement.srcObject.getTracks().forEach((track) => track.stop());
    videoElement.srcObject = null;
  }
}

function closePC(pc = peerConnection) {
  if (!pc) return;
  console.log("stopping peer connection");
  pc.close();
  pc.removeEventListener(
    "icegatheringstatechange",
    onIceGatheringStateChange,
    true
  );
  pc.removeEventListener("icecandidate", onIceCandidate, true);
  pc.removeEventListener(
    "iceconnectionstatechange",
    onIceConnectionStateChange,
    true
  );
  pc.removeEventListener(
    "connectionstatechange",
    onConnectionStateChange,
    true
  );
  pc.removeEventListener("signalingstatechange", onSignalingStateChange, true);
  pc.removeEventListener("track", onTrack, true);
  clearInterval(statsIntervalId);
  iceGatheringStatusLabel.innerText = "";
  signalingStatusLabel.innerText = "";
  iceStatusLabel.innerText = "";
  peerStatusLabel.innerText = "";
  console.log("stopped peer connection");
  if (pc === peerConnection) {
    peerConnection = null;
  }
}

function onIceCandidateError(event) {
  console.log(event);
}
function onNegotiationNeeded(event) {
  console.log(event);
}
