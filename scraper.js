const puppeteer = require("puppeteer");
const fs = require('fs')

//init files
const jsonFile = "teams.json"
let teamData = []
//scrape function
async function scrape(url) {
    //init puppeteer browser
    const browser = await puppeteer.launch();

    try {
        const page = await browser.newPage()
        await page.goto(url); //navigate to webpage
        await page.waitForSelector("button.btn-update"); //find update button to have latest info
        await page.click("button.btn-update"); 

        try { //in real browser sometimes anti-spam confirmation occurs, does not seem to trigger from scraper
            await page.waitForSelector("button.btn-custom", {timeout: 2000});
            const authElement = await page.$("button.btn-custom");
            if (authElement) {
                await page.click("button.btn-custom:nth-of-type(1)"); //click first button (yes)
                console.log("Clicked update now")
            }    
        }
        catch (timeoutError) {} // discard if no confirmation window appears
        await new Promise(r => setTimeout(r, 1000)) // wait 1 second for update
        await page.reload() // reload for most accurate data (website limitation)
        await page.waitForSelector(".cote-atm-value"); // find data element
        const data = await page.evaluate(() => {
            const elements = document.querySelectorAll('.cote-atm-value'); //target the value element
            const array = Array.from(elements, element => element.textContent) //select correct value
            return array[1]
        }
    );
    return data;
    }
    catch (error) {
        console.error("Error:", error)
    }
    finally {
        await browser.close() //cleanup
    }
}

async function scrapeAllData(data){
    const teams = []; //init array
    let scrapedData;
    let count =  0;
    for (const team of data) {
        let teamData = {teamName: team.teamName, players: [] }; //init team object
        
        teams.push(teamData); //add object elements to array
        for (const player of team.players) { //iterate through object (for loop rather than .foreach())
            const playerData = { name : player.name, url: player.url, scrapedData: null }; //init player object
          
            try {
                scrapedData  = await scrape(player.url); //pull rating value
                count++;
                console.log(`${count}. ${player.name} (${JSON.stringify(scrapedData)}) CR gather successful`) //progress output
                playerData.scrapedData = scrapedData; 
            } catch (error) {
                console.error(`Error scraping data for ${player.name}`, error);
            }
            teamData.players.push(playerData); //push scraped data into object 
        }
    }
    return teams;
}

function selectThreeHighest(data) {
    data.sort((a, b) => b - a); //sort for the three highest rated players and push them back
    return [data[0], data[1], data[2]]; 
}

function orderTeams(teams) {
    const sortedCRTeams = {}; //initialize objects to work with
    const avgCRTeams = {};
    teams.forEach(team => { //teams is an array, use foreach
        let scrapedDataArray = [];
        team.players.forEach(player => {
            scrapedDataArray.push(player.scrapedData); //add scrapedData to workable array
        });   
        sortedCRTeams[team.teamName] = selectThreeHighest(scrapedDataArray) //transform array to useful data
          
    });

    for (const teamName in sortedCRTeams) {
        const teamValues = sortedCRTeams[teamName];
       
        let sum = +sortedCRTeams[teamName][0] + +sortedCRTeams[teamName][1] + +sortedCRTeams[teamName][2]; //sum and average values
        let avg = sum / 3;
        avgCRTeams[teamName] = avg;
    }

    let sortedAvgCRTeams = Object.entries(avgCRTeams) //sort the teams by their average ratings, descending
        .sort((a, b) => b[1] - a[1])
        .reduce((acc, [key, value]) => {
            acc[key] = value;
            return acc;
        }, {})

    return sortedAvgCRTeams;
    
}
fs.readFile(jsonFile, 'utf8', async (err, data) => {
    if (err) {
        console.error("Error reading: ", err)
    }
    try {
        teamData = JSON.parse(data);   //parse original data
        const scrapedTeamData = await scrapeAllData(teamData) //scrape from net
        console.log("CR gather complete")
        const orderedTeamData = orderTeams(scrapedTeamData) // order teams
        console.log("Sorted teams:")
        let count = 1
        for (const teamName in orderedTeamData) {
            const value = orderedTeamData[teamName].toFixed(2) //format team cr value to 2 DP
            console.log(`${count}. ${teamName}: ${value}`); //output final
            count++;
        }
    } catch (error) { console.error("Error parsing: ", error)}
});
