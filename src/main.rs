extern crate serde;
extern crate serde_json;
extern crate clap;

use std::{thread, time};
use std::io::{self, Read, Write};
use std::fs::File;
use std::error::Error;
use std::net::TcpStream;

use url::Url;

use clap::{App, Arg};

use tungstenite::{connect, Message};
use tungstenite::protocol::WebSocket;
use tungstenite::stream::Stream as StreamSwitcher;
type AutoStream = StreamSwitcher<TcpStream, TlsStream<TcpStream>>;

#[cfg(feature = "tls")]
use native_tls::TlsStream;

// mod models;
// use models::{AircraftData, PumpResponse};

fn main() -> () {
  // gather args
  let matches = App::new("pump1090")
    .version("0.1.1")
    .author("Robert Steilberg <rsteilberg@gmail.com>")
    .about("Reads dump1090 JSON output and sends it to an endpoint via a websocket.")
    .arg(
      Arg::with_name("file")
        .short("f")
        .long("file")
        .takes_value(true)
        .help("The dump file to watch"),
    )
    .arg(
      Arg::with_name("endpoint")
        .short("e")
        .long("endpoint")
        .takes_value(true)
        .help("The endpoint to POST to"),
    )
    .get_matches();
  let endpoint = matches
    .value_of("endpoint")
    .unwrap_or("ws://localhost:3001/test");
  let filename = matches.value_of("file").unwrap_or("data/aircraft.json");
  println!("Initializing pump1090...");
  println!("Websocket endpoint: {}", &endpoint);
  println!("Dumpfile path: {}", &filename);
  init_pump(String::from(endpoint), String::from(filename));
  println!("pump1090 terminated")
}

/// start the infinite recursive loop that will establish the websocket and begin
/// the timer that watches the dump file; ininitely recurses so that, if the websocket
/// connection is broken, it will attempt to re-establish the websocket connection
#[allow(unconditional_recursion)]
fn init_pump(endpoint: String, filename: String) -> () {
  let socket = init_pipe(&endpoint, 1);
  init_dump_timer(socket, String::from(&filename)).unwrap_or_else(handle_error);
  init_pump(String::from(&endpoint), String::from(&filename)); // go forever!
  ()
}

/// actually establish the websocket connections
fn init_pipe(endpoint: &String, attempt: isize) -> WebSocket<AutoStream> {
  print!("\rAttempting to establish pipe with {} (attempt {})", endpoint, attempt);
  io::stdout().flush().unwrap();
  let resp = connect(Url::parse(&endpoint).unwrap());
  match resp {
    Ok((socket, _)) => {
      println!("\nPipe successfully established with {} on attempt {}", endpoint, attempt);
      socket
    }
    Err(_) => {
      thread::sleep(time::Duration::from_millis(5000));
      init_pipe(endpoint, attempt + 1)
    }
  }
}

/// read the dump file every n seconds and pump it to the websocket endpoint
fn init_dump_timer(
  mut socket: WebSocket<AutoStream>,
  filename: String,
) -> Result<(), Box<dyn Error>> {
  let mut run_count: isize = 1;
  print!("Run count: {}", run_count);
  io::stdout().flush().unwrap();
  loop {
    let data = read_json(&filename)?;
    match pump_data(socket, data) {
      Ok(s) => socket = s, // successfully sent data
      Err(_) => {
        println!("\nUnable to write to pipe; attempting to re-establish connection...");
        break Ok(());
      }
    }
    run_count = run_count + 1;
    print!("\rPump count: {}", run_count);
    io::stdout().flush().unwrap();
    thread::sleep(time::Duration::from_millis(1000));
  }

}

/// read the input file, serialize it and attach metadata, and then
/// convert it back to a string so it can be sent through websocket
fn read_json(filename: &String) -> Result<String, Box<dyn Error>> {
  // first, read the input file to string
  let mut file = File::open(filename)?;
  let mut contents = String::new();
  file.read_to_string(&mut contents)?;
  // then, serialize it
  // let data: AircraftData = serde_json::from_str(&contents)?;
  // Ok(data)
  Ok(contents)
}

/// take a message (string) and send it to the specified socket
fn pump_data(
  mut socket: WebSocket<AutoStream>,
  data: String,
) -> Result<WebSocket<AutoStream>, tungstenite::error::Error> {
  // ping the socket for liveness check
  socket.write_message(Message::Ping(Vec::new()))?;
  // attempt the actual write
  socket.write_message(Message::Text(data))?;
  // println!("Successfully wrote dump file to pipe");
  Ok(socket)
}

/// generic error handler that panics the entire thread
fn handle_error(e: Box<dyn Error>) -> () {
  println!("FATAL ERROR ----------------------------------------------------------");
  println!("Error message: {}", e);
  panic!()
}
