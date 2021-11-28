# `serve1090` Changelog
All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased]
### Added
### Changed
- upgrade node to v16.13.0
### Fixed
- mongo dockerfile issues
- pm2-runtime directly called in express Dockerfile
### Removed
### Breaking

## [2.4.0] - 2021-11-27
### Changed
- airports dynamically queried from mongo
- update test dependencies

## [2.3.0] - 2021-7-15
### Changed
- node bumped to `16.5.0`
- npm bumped to `7.19.1`
### Fixed
- refactor all routes and write tests
- general refactor of lib and middleware code with testing

## [2.2.0] - 2020-10-01
### Added
- add root router for displaying basic application info at `/`
- add `totalCount` and `validCount` endpoints to `/aircraft`
### Changed
- update README and add API documentations
- clean up airport modules
- track number of pump and broadcast clients
### Fixed
- `hlen` does not use pipeline since could accidentally return pipeline when in race condition with aircraft write
- better construction of boards in airspaces router

## [2.1.0] - 2020-07-31
### Changed
- overhaul routes
- validate pump payloads
### Fixed
- proper dockerization and setup for `docker-compose`
- route structure and auth
- setup script
