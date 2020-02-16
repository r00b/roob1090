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

mod models;
use models::{AircraftData, PumpResponse};

fn main() -> Result<(), reqwest::Error> {
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
        .arg(
            Arg::with_name("verbose")
                .short("v")
                .long("verbose")
                .help("Print verbose debug info"),
        )
        .get_matches();
    let endpoint = matches.value_of("endpoint").unwrap_or("http://localhost:3000/dca");
    let filename = matches.value_of("file").unwrap_or("data/aircraft.json");
    let debug = matches.is_present("verbose");
    if debug {
        println!("Verbose debug logging enabled.");
        println!("POST endpoint: {}.", &endpoint);
        println!("Dump file: {}.", &filename);
    }
    // init the loop that watches the file
    init_dump_watcher(String::from(endpoint), String::from(filename), debug)
}

#[tokio::main]
async fn init_dump_watcher(endpoint: String, filename: String, debug: bool) -> Result<(), reqwest::Error> {
    if debug {
        println!("Initializing file watch on {}...", &filename);
    }
    // create channel to receive the events
    let (tx, rx) = channel();
    // create watched object to deliver raw events; notification selected based on platform
    let mut watcher = raw_watcher(tx).unwrap();
    // set watcher on file
    watcher.watch(&filename, RecursiveMode::Recursive).unwrap(); // will terminate program if file not found
    if debug {
        println!("Successfully initialized file watch on {}.", &filename);
        println!("----------------------------------------------------------");
    }
    let mut run_count: isize = 1;
    // track last cookie, since RENAME events trigger 2 callbacks
    let mut last_cookie: u32 = 0;
    loop {
        match rx.recv() {
            Ok(RawEvent {
                path: Some(path),
                op: Ok(op),
                cookie: Some(cookie),
            }) => {
                if last_cookie != cookie {
                    last_cookie = cookie;
                    if debug {
                        println!("Run: {}; cookie: {:?}", run_count, cookie);
                        println!("{:?} detected on {:?}, reading dump file...", op, path);
                    }
                    let data = read_json(&filename);
                    match data {
                        Err(err) => {
                            println!("ERROR: unable to read dump file {:?}; {}.", path, err)
                        }
                        Ok(data) => {
                            if debug {
                                println!("Successfully read dump file.");
                            }
                            post_data(&endpoint, data, debug).await?
                        }
                    }
                    run_count = run_count + 1;
                    if debug {
                        println!("----------------------------------------------------------");
                    }
                }
            }
            Ok(event) => println!("ERROR: broken event on {}: {:?}", &filename, event),
            Err(e) => println!("ERROR: watch error on {}: {:?}", &filename, e),
        }
    }
}

// read the input file and serialize it
fn read_json(filename: &String) -> Result<AircraftData, Box<dyn Error>> {
    // first, read the input file to string
    let mut file = File::open(filename)?;
    let mut contents = String::new();
    file.read_to_string(&mut contents)?;
    // then, serialize it
    let data: AircraftData = serde_json::from_str(&contents)?;
    Ok(data)
}

// TODO: sockets?
async fn post_data(endpoint: &String, data: AircraftData, debug: bool) -> Result<(), reqwest::Error> {
    if debug {
        println!("Attempting to POST data to {}...", endpoint);
    }
    let resp: Result<reqwest::Response, reqwest::Error> = reqwest::Client::new()
        .post(endpoint)
        .json(&data)
        .send()
        .await;
    match resp {
        Ok(resp) => handle_post_success(resp, debug).await?,
        Err(e) => handle_post_error(e),
    }
    Ok(())
}

async fn handle_post_success(resp: reqwest::Response, debug: bool) -> Result<(), reqwest::Error> {
    let json = resp.json::<PumpResponse>().await;
    match json {
        Ok(json) => {
            if debug {
                println!("POST successful; response: {}.", json.status);
            }
        },
        Err(e) => println!("POST successful, but unable to parse response: {}.", e),
    }
    Ok(())
}

fn handle_post_error(err: reqwest::Error) {
    println!("ERROR: POST failed; {}.", err)
}
