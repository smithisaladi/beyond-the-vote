package com.beyondthevote;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;

@SpringBootApplication
@EnableCaching
public class BeyondTheVoteApplication {

    public static void main(String[] args) {
        SpringApplication.run(BeyondTheVoteApplication.class, args);
    }
}
