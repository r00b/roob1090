#[macro_use]
extern crate serde;
extern crate clap;
extern crate notify;
extern crate reqwest;
extern crate serde_json;

use clap::{App, Arg};
use notify::{raw_watcher, RawEvent, RecursiveMode, Watcher};
use std::error::Error;
use std::fs::File;
use std::io::Read;
use std::sync::mpsc::channel;
use tungstenite::{connect, Message};

use std::net::TcpStream;
use tungstenite::protocol::WebSocket;
use tungstenite::stream::Stream;

#[cfg(feature = "tls")]
use native_tls::TlsStream;

use url::Url;

pub use tungstenite::stream::Stream as StreamSwitcher;
pub type AutoStream = StreamSwitcher<TcpStream, TlsStream<TcpStream>>;

mod models;
use models::{AircraftData, PumpResponse};

// fn main() -> Result<(), reqwest::Error> {
fn main() -> () {
  // gather args
  let matches = App::new("pump1090")
    .version("0.1.1")
    .author("Robert Steilberg <rsteilberg@gmail.com>")
    .about("Reads dump1090 output and POSTs it to an endpoint.")
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
  println!("POST endpoint: {}.", &endpoint);
  println!("Dump file: {}.", &filename);
  init_master_worker(String::from(endpoint), String::from(filename));
  println!("pump1090 terminated")
}

fn init_master_worker(endpoint: String, filename: String) -> () {
  let mut socket = init_pipe(&endpoint);
  // init the loop that watches the file
  // match init_dump_watcher(socket, String::from(&filename), debug) {
  //   Err(e) => {
  //     println!("ERROR =================================");
  //     panic!("{}", e);
  //   }
  //   Ok(_) => {}
  // }
  init_dump_watcher(socket, String::from(&filename)).unwrap_or_else(handle_error);
  init_master_worker(String::from(&endpoint), String::from(&filename)); // go forever!
  ()
}

fn handle_error(e: Box<dyn Error>) -> () {
  println!("FATAL ERROR ----------------------------------------------------------");
  println!("Error message: {}", e);
  panic!()
}

use std::{thread, time};

fn init_pipe(endpoint: &String) -> WebSocket<AutoStream> {
  println!("Attempting to establish pipe with {}", endpoint);
  let resp = connect(Url::parse(&endpoint).unwrap());
  match resp {
    Ok((socket, _)) => {
      println!("Pipe successfully established with {}", endpoint);
      socket
    }
    Err(_) => {
      println!("Unable to open pipe; trying again in 5 seconds.");
      thread::sleep(time::Duration::from_millis(5000));
      init_pipe(endpoint)
    }
  }
}

fn init_dump_watcher(
  mut socket: WebSocket<AutoStream>,
  filename: String,
) -> Result<(), Box<dyn Error>> {
  // init file watch
  println!("Initializing file watch on {}", &filename);
  // create channel to receive the events
  let (tx, rx) = channel();
  // create watched object to deliver raw events; notification selected based on platform
  let mut watcher = raw_watcher(tx)?;
  // set watcher on file
  watcher.watch(&filename, RecursiveMode::Recursive)?;
  println!("Successfully initialized file watch on {}", &filename);
  println!("----------------------------------------------------------");
  let mut run_count: isize = 0;
  loop {
    match rx.recv() {
      Ok(RawEvent {
        path: Some(path),
        op: Ok(op),
        cookie: _,
      }) => {
        let data = read_json(&filename)?;
        match pump_data(socket, data) {
          Ok(s) => socket = s,
          Err(_) => {
            println!("Unable to write to pipe; attempting to re-establish");
            break Ok(());
          }
        }
      }
      Ok(event) => println!("ERROR: broken event on {}: {:?}", &filename, event),
      Err(e) => println!("ERROR: watch error on {}: {:?}", &filename, e),
    }
    run_count = run_count + 1;
    println!("Run count: {}", run_count);
  }
}

// fn handle_file_update(filename: String, debug: bool) -> () {
//   let data = read_json(&filename);
//   match data {
//     Err(err) => println!("ERROR: unable to read dump file {:?}; {}.", path, err),
//     Ok(data) => {
//       if debug {
//         println!("Successfully read dump file.\nWriting data to pipe...");
//       }
//       let res = pump_data(socket, data);
//       match res {
//         Ok(s) => socket = s,
//         Err(_) => {
//           println!("Unable to write to pipe; attempting to re-establish");
//           break Ok(());
//         }
//       }
//     }
//   }
// }

// read the input file and serialize it
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

fn pump_data(
  mut socket: WebSocket<AutoStream>,
  data: String,
) -> Result<WebSocket<AutoStream>, tungstenite::error::Error> {
  // ping the socket for liveness check
  socket.write_message(Message::Ping(Vec::new()))?;
  // attempt the write
  socket.write_message(Message::Text(data))?;
  println!("Successfully wrote dump file to pipe.");
  Ok(socket)
}
