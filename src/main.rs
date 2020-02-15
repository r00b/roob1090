#[macro_use]
extern crate serde;
extern crate notify;
extern crate reqwest;
extern crate serde_json;

use std::env;
use notify::{raw_watcher, RawEvent, RecursiveMode, Watcher};
use std::error::Error;
use std::fs::File;
use std::io::Read;
use std::sync::mpsc::channel;

mod models;
use models::{AircraftData, PumpResponse};

fn main () -> Result<(), reqwest::Error> {
    let args: Vec<String> = env::args().collect();

    let arg_endpoint = &args.get(1);
    let endpoint: String;
    match arg_endpoint {
        Some(url) => endpoint = url.to_string(),
        None      => endpoint = String::from("http://localhost:3000/dca"),
    }
    println!("POST endpoint: {}.", &endpoint);

    // determine if the user specified a filename to watch
    let arg_filename = &args.get(2);
    let filename: String;
    match arg_filename {
        Some(file) => filename = file.to_string(),
        None       => filename = String::from("data/aircraft.json"),
    }
    println!("Computed dump file to watch: {}.", &filename);

    // init the loop that watches the file
    init_dump_watcher(endpoint, filename)
}

#[tokio::main]
async fn init_dump_watcher (endpoint: String, filename: String) -> Result<(), reqwest::Error> {
    println!("Initializing file watch on {}...", &filename);
    // create channel to receive the events
    let (tx, rx) = channel();
    // create watched object to deliver raw events; notification selected based on platform
    let mut watcher = raw_watcher(tx).unwrap();
    // set watcher on file
    watcher
        .watch(&filename, RecursiveMode::Recursive)
        .unwrap(); // will terminate program if file not found
    println!("Successfully initialized file watch on {}.", &filename);
    println!("----------------------------------------------------------");
    loop {
        println!("----------------------------------------------------------");
        match rx.recv() {
            Ok(RawEvent {
                path: Some(_),
                op: Ok(op),
                cookie: _,
            }) => {
                println!("{:?} detected on {}, reading dump file...", op, &filename);
                let data = read_json(&filename);
                match data {
                    Err(err) => println!("ERROR: unable to read dump file {}; {}.", &filename, err),
                    Ok(data) => {
                        println!("Successfully read dump file.");
                        post_data(&endpoint, data).await?
                    },
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
async fn post_data (endpoint: &String, data: AircraftData) -> Result<(), reqwest::Error> {
    println!("Attempting to POST data to {}...", endpoint);
    let resp: Result<reqwest::Response, reqwest::Error> = reqwest::Client::new()
        .post(endpoint)
        .json(&data)
        .send()
        .await;
    match resp {
        Err(e) => handle_post_error(e),
        Ok(resp)  => handle_post_success(resp).await?,
    }
    Ok(())
}

async fn handle_post_success (resp: reqwest::Response) -> Result<(), reqwest::Error> {
    let json = resp
        .json::<PumpResponse>()
        .await;
    match json {
        Err(e) => println!("POST successful, but unable to parse response: {}.", e),
        Ok(json)  => println!("POST successful; response: {}.", json.status),
    }
    Ok(())
}

fn handle_post_error (err: reqwest::Error) {
    println!("ERROR: POST failed; {}.", err)
}
