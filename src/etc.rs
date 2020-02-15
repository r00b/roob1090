// //GET
// // #[tokio::main]
// // async fn main() -> Result<(), reqwest::Error> {
// //     let res = reqwest::get("http://10.195.24.18:3000/dca").await?;
// //     println!("Status: {}", res.status());
// //     let body = res.text().await?;
// //     println!("Body:\n\n{}", body);
// //     Ok(())
// // }
//
//
// #[tokio::main]
// async fn main() -> Result<(), reqwest::Error> {
//
//     let data = try_main().unwrap();
//     println!("{:#?}", data);
//
//
//
//
//     // TODO handle when server is down
//     // TODO do we want to use form data
//     // let echo_json: serde_json::Value = reqwest::Client::new()
//     //     .post("http://10.195.24.18:3000/dca")
//     //     .json(&data)
//     //     .send()
//     //     .await?
//     //     .json()
//     //     .await?;
//     //
//     // println!("{:#?}", echo_json);
//     Ok(())
// }
//
