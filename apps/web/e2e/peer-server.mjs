import { PeerServer } from "peer";

PeerServer({ port: 9000, path: "/camosaic" });
console.log("peer server on :9000");
