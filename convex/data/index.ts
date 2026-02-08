import type { MunicipalityData } from "./types";

import { ALABAMA } from "./states/alabama";
import { ALASKA } from "./states/alaska";
import { ARIZONA } from "./states/arizona";
import { ARKANSAS } from "./states/arkansas";
import { CALIFORNIA } from "./states/california";
import { COLORADO } from "./states/colorado";
import { CONNECTICUT } from "./states/connecticut";
import { DELAWARE } from "./states/delaware";
import { FLORIDA } from "./states/florida";
import { GEORGIA } from "./states/georgia";
import { HAWAII } from "./states/hawaii";
import { IDAHO } from "./states/idaho";
import { ILLINOIS } from "./states/illinois";
import { INDIANA } from "./states/indiana";
import { IOWA } from "./states/iowa";
import { KANSAS } from "./states/kansas";
import { KENTUCKY } from "./states/kentucky";
import { LOUISIANA } from "./states/louisiana";
import { MAINE } from "./states/maine";
import { MARYLAND } from "./states/maryland";
import { MASSACHUSETTS } from "./states/massachusetts";
import { MICHIGAN } from "./states/michigan";
import { MINNESOTA } from "./states/minnesota";
import { MISSISSIPPI } from "./states/mississippi";
import { MISSOURI } from "./states/missouri";
import { MONTANA } from "./states/montana";
import { NEBRASKA } from "./states/nebraska";
import { NEVADA } from "./states/nevada";
import { NEW_HAMPSHIRE } from "./states/new_hampshire";
import { NEW_JERSEY } from "./states/new_jersey";
import { NEW_MEXICO } from "./states/new_mexico";
import { NEW_YORK } from "./states/new_york";
import { NORTH_CAROLINA } from "./states/north_carolina";
import { NORTH_DAKOTA } from "./states/north_dakota";
import { OHIO } from "./states/ohio";
import { OKLAHOMA } from "./states/oklahoma";
import { OREGON } from "./states/oregon";
import { PENNSYLVANIA } from "./states/pennsylvania";
import { RHODE_ISLAND } from "./states/rhode_island";
import { SOUTH_CAROLINA } from "./states/south_carolina";
import { SOUTH_DAKOTA } from "./states/south_dakota";
import { TENNESSEE } from "./states/tennessee";
import { TEXAS } from "./states/texas";
import { UTAH } from "./states/utah";
import { VERMONT } from "./states/vermont";
import { VIRGINIA } from "./states/virginia";
import { WASHINGTON } from "./states/washington";
import { WEST_VIRGINIA } from "./states/west_virginia";
import { WISCONSIN } from "./states/wisconsin";
import { WYOMING } from "./states/wyoming";

export const ALL_STATES: Record<string, MunicipalityData[]> = {
	Alabama: ALABAMA,
	Alaska: ALASKA,
	Arizona: ARIZONA,
	Arkansas: ARKANSAS,
	California: CALIFORNIA,
	Colorado: COLORADO,
	Connecticut: CONNECTICUT,
	Delaware: DELAWARE,
	Florida: FLORIDA,
	Georgia: GEORGIA,
	Hawaii: HAWAII,
	Idaho: IDAHO,
	Illinois: ILLINOIS,
	Indiana: INDIANA,
	Iowa: IOWA,
	Kansas: KANSAS,
	Kentucky: KENTUCKY,
	Louisiana: LOUISIANA,
	Maine: MAINE,
	Maryland: MARYLAND,
	Massachusetts: MASSACHUSETTS,
	Michigan: MICHIGAN,
	Minnesota: MINNESOTA,
	Mississippi: MISSISSIPPI,
	Missouri: MISSOURI,
	Montana: MONTANA,
	Nebraska: NEBRASKA,
	Nevada: NEVADA,
	"New Hampshire": NEW_HAMPSHIRE,
	"New Jersey": NEW_JERSEY,
	"New Mexico": NEW_MEXICO,
	"New York": NEW_YORK,
	"North Carolina": NORTH_CAROLINA,
	"North Dakota": NORTH_DAKOTA,
	Ohio: OHIO,
	Oklahoma: OKLAHOMA,
	Oregon: OREGON,
	Pennsylvania: PENNSYLVANIA,
	"Rhode Island": RHODE_ISLAND,
	"South Carolina": SOUTH_CAROLINA,
	"South Dakota": SOUTH_DAKOTA,
	Tennessee: TENNESSEE,
	Texas: TEXAS,
	Utah: UTAH,
	Vermont: VERMONT,
	Virginia: VIRGINIA,
	Washington: WASHINGTON,
	"West Virginia": WEST_VIRGINIA,
	Wisconsin: WISCONSIN,
	Wyoming: WYOMING,
};

export const ALL_MUNICIPALITIES: MunicipalityData[] = Object.values(ALL_STATES).flat();

export const STATE_NAMES = Object.keys(ALL_STATES);