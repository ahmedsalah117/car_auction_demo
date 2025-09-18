import { Server } from "socket.io";

// In-memory storage for our auction data (in real app, there will be a database)
let auctionData = {
  id: 1,
  carTitle: "2020 Toyota Camry",
  carImage: "/car-image.jpg",
  startPrice: 15000,
  currentBid: 15000,
  highestBidder: null,
  participants: [],
  bids: [],
  startTime: Date.now(),
  endTime: Date.now() + 0.5 * 60 * 1000, // 30 seconds from now just so you can test the auction ending quickly
  isActive: true,
  version: 1, // Version number for Optimistic Locking (Optimistic Concurrency Control) to prevent race conditions when multiple users are bidding at the same time (The scenario I was asked about.)
};

export default function handler(req, res) {
  if (res.socket.server.io) {
    console.log("Socket is already running");
    res.end();
    return;
  }

  console.log("Socket is initializing");
  const io = new Server(res.socket.server, {
    path: "/api/socketio",
    addTrailingSlash: false,
  });

  res.socket.server.io = io;

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Send current auction data when user connects
    socket.emit("auction-data", auctionData);

    // Handle new bid with race condition protection
    socket.on("place-bid", (bidData) => {
      try {
        const { amount, bidderName, expectedVersion } = bidData;
        const now = Date.now();

        // Basic input validation and coercion
        const amountNum =
          typeof amount === "number"
            ? amount
            : Number(
                String(amount ?? "")
                  .replace(/[, ]+/g, "")
                  .trim()
            );
        
        // the regex used above is to remove any commas or spaces from the bid amount.

        const name = typeof bidderName === "string" ? bidderName.trim() : "";

        const MAX_BID = 10_000_000;
// validating against infinity.
        if (!Number.isFinite(amountNum)) {
          socket.emit("bid-error", "Invalid bid amount");
          socket.emit("auction-data", auctionData);
          return;
        }
        // validating against 0.
        if (amountNum <= 0) {
          socket.emit("bid-error", "Bid amount must be greater than 0");
          socket.emit("auction-data", auctionData);
          return;
        }
        // validating against the maximum bid.
        if (amountNum > MAX_BID) {
          socket.emit("bid-error", `Bid amount must not exceed ${MAX_BID}`);
          socket.emit("auction-data", auctionData);
          return;
        }
        // validating against the bidder name.
        if (!name) {
          socket.emit("bid-error", "Invalid bidder name");
          return;
        }

// making sure the expected version is an integer.
        const expVer = Number.isInteger(expectedVersion)
          ? expectedVersion
          : null;

        console.log(
          `Bid attempt: ${name} - ${amountNum} (expected v${expVer}, current v${auctionData.version})`
        );

        // Validation: Check if the auction is still active
        if (!auctionData.isActive || now > auctionData.endTime) {
          socket.emit("bid-error", "Auction has ended");
          return;
        }

        // RACE CONDITION PROTECTION
        if (expVer !== null && expVer !== auctionData.version) {
          socket.emit(
            "bid-error",
            "Someone else placed a bid first. Please try again with the updated price."
          );
          socket.emit("auction-data", auctionData);
          return;
        }

        // Validation: Bid must be higher than current bid
        if (amountNum <= auctionData.currentBid) {
          socket.emit(
            "bid-error",
            `Bid must be higher than current bid of ${auctionData.currentBid}`
          );
          socket.emit("auction-data", auctionData);
          return;
        }

        // ATOMIC UPDATE: Updating the auction data.
        auctionData.currentBid = amountNum;
        auctionData.highestBidder = name;
        auctionData.version++;

        // adding the bidder to the participants array.
        if (!auctionData.participants.includes(name)) {
          auctionData.participants.push(name);
        }

        // adding the bid to the bids array as a history of bids.
        auctionData.bids.push({
          amount: amountNum,
          bidder: name,
          timestamp: now,
        });

        console.log(
          `✅ Bid accepted: ${name} - ${amountNum} (new version: ${auctionData.version})`
        );

        // broadcasting the auction data to all clients again to reflect the new bid.

        io.emit("auction-data", auctionData);
        // broadcasting the new bid to all clients.
        io.emit("new-bid", {
          amount: amountNum,
          bidder: name,
          timestamp: now,
        });
      } catch (err) {
        // catching any unhandled errors here.
        console.error("Error handling place-bid:", err);
        socket.emit("bid-error", "Unexpected server error. Please try again.");
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  // Auto-closing the auction when time expires
  const checkAuctionEnd = () => {
    if (auctionData.isActive && Date.now() > auctionData.endTime) {
      auctionData.isActive = false;

      // Handling a case where no bids were placed.
      if (auctionData.bids.length === 0) {
        // No bids were placed
        io.emit("auction-ended", {
          winner: null,
          finalPrice: null,
          message: "Auction ended with no bids placed",
        });
        console.log("Auction ended with no participants");
      } else {
        // Auction ended with bids
        io.emit("auction-ended", {
          winner: auctionData.highestBidder,
          finalPrice: auctionData.currentBid,
          message: `Auction ended! Winner: ${auctionData.highestBidder}`,
        });

        console.log(
          `Auction ended! Winner: ${auctionData.highestBidder} with ${auctionData.currentBid}`
        );
      }
      //broadcasting the auction data to all clients again to reflect the inActive status
      io.emit("auction-data", auctionData);
    }
  };

  // Checking every second if the auction should end
  setInterval(checkAuctionEnd, 1000);

  res.end();
}
