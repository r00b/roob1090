// // TODO: sockets?
// async fn post_data(
//     endpoint: &String,
//     data: AircraftData,
//     debug: bool,
// ) -> Result<(), reqwest::Error> {
//     if debug {
//         println!("Attempting to POST data to {}...", endpoint);
//     }
//     let resp: Result<reqwest::Response, reqwest::Error> = reqwest::Client::new()
//         .post(endpoint)
//         .json(&data)
//         .send()
//         .await;
//     match resp {
//         Ok(resp) => handle_post_success(resp, debug).await?,
//         Err(e) => handle_post_error(e),
//     }
//     Ok(())
// }
//
// async fn handle_post_success(resp: reqwest::Response, debug: bool) -> Result<(), reqwest::Error> {
//     let json = resp.json::<PumpResponse>().await;
//     match json {
//         Ok(json) => {
//             if debug {
//                 println!("POST successful; response: {}.", json.status);
//             }
//         }
//         Err(e) => println!("POST successful, but unable to parse response: {}.", e),
//     }
//     Ok(())
// }
//
// fn handle_post_error(err: reqwest::Error) {
//     println!("ERROR: POST failed; {}.", err)
// }
