#[macro_use]
extern crate clap;
extern crate serde_json;

use dotenv::dotenv;

use std::error::Error;
use std::fs::File;
use std::io::{self, Read, Write};
use std::net::TcpStream;
use std::{env, thread, time};

use url::Url;

use clap::{App};

use serde_json::Value;

use tungstenite::protocol::WebSocket;
use tungstenite::stream::Stream as StreamSwitcher;
use tungstenite::{connect, Message};
type AutoStream = StreamSwitcher<TcpStream, TlsStream<TcpStream>>;

#[cfg(feature = "tls")]
use native_tls::TlsStream;

fn main() -> () {
  // load env file
  dotenv().ok();
  // load cli args
  let yaml = load_yaml!("cli.yml");
  let matches = App::from_yaml(yaml).get_matches();

  let filename: String = unwrap_arg(
    "data/aircraft.json",
    "DUMPFILE_PATH",
    matches.value_of("dumpfile"),
  );
  let endpoint: String = unwrap_arg(
    "ws://localhost:3000/pump",
    "WS_ENDPOINT",
    matches.value_of("endpoint"),
  );
  let device_id: String = unwrap_arg("undefined", "SERVE1090_SECRET", matches.value_of("secret"));

  println!("Initializing pump1090...");
  println!("Device id: {}", device_id);
  println!("Dumpfile path: {}", filename);
  println!("Websocket endpoint: {}", endpoint);
  init_pump(&device_id, &filename, &endpoint);
  println!("pump1090 terminated.")
}

/// compute the value of an arg; do this by checking if the arg was specified on the command
/// line, then checking .env for the value of env_var-name, and finally using default_val
fn unwrap_arg(default_val: &str, env_var_name: &str, cli_arg: Option<&str>) -> String {
  let env_arg = env::var(env_var_name).unwrap_or_else(|_| default_val.to_string());
  let unwrapped_arg = cli_arg.unwrap_or_else(|| &env_arg);
  unwrapped_arg.to_string()
}

/// start the infinite recursive loop that will establish the WebSocket and begin
/// the timer that watches the dump file; ininitely recurses so that, if the WebSocket
/// connection is broken, it will attempt to re-establish the WebSocket connection
#[allow(unconditional_recursion)]
fn init_pump(device_id: &str, filename: &str, endpoint: &str) -> () {
  let socket = init_pipe(endpoint, 1);
  init_dump_timer(device_id, filename, socket).unwrap_or_else(handle_error);
  init_pump(device_id, filename, endpoint); // go forever!
  ()
}

/// actually establish the WebSocket connection
fn init_pipe(endpoint: &str, attempt: isize) -> WebSocket<AutoStream> {
  print!(
    "\rAttempting to establish pipe with {} (attempt {})",
    endpoint, attempt
  );
  io::stdout().flush().unwrap();
  // TODO better error handling
  let resp = connect(Url::parse(endpoint).unwrap());
  match resp {
    Ok((socket, _)) => {
      println!("\nSuccess (on attempt {})", attempt);
      socket
    }
    Err(_) => {
      thread::sleep(time::Duration::from_millis(5000));
      init_pipe(endpoint, attempt + 1)
    }
  }
}

/// read the dump file every n seconds and pump it to the WebSocket endpoint
fn init_dump_timer(
  device_id: &str,
  filename: &str,
  mut socket: WebSocket<AutoStream>,
) -> Result<(), Box<dyn Error>> {
  let mut run_count: isize = 1;
  print!("Run count: {}", run_count);
  io::stdout().flush().unwrap();
  loop {
    let data = read_json(device_id, filename)?;
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
    thread::sleep(time::Duration::from_millis(500));
  }
}

/// read the input file, serialize it and attach metadata, and then
/// convert it back to a string so it can be sent through WebSocket
fn read_json(device_id: &str, filename: &str) -> Result<String, Box<dyn Error>> {
  // first, read the input file to string
  let mut file = File::open(filename)?;
  let mut contents = String::new();
  file.read_to_string(&mut contents)?;
  // then, serialize it
  let mut data: Value = serde_json::from_str(&contents)?;
  data["secret"] = device_id.into();
  let payload: String = serde_json::to_string(&data)?;
  Ok(payload)
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
  Ok(socket)
}

/// generic error handler that panics the entire thread
fn handle_error(e: Box<dyn Error>) -> () {
  println!("FATAL ERROR ----------------------------------------------------------");
  println!("Error message: {}", e);
  panic!()
}
